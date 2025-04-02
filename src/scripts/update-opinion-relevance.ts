const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
/** @typedef {import('@google/generative-ai').GenerativeModel} GenerativeModel */
const { RateLimiterMemory, RateLimiterRes } = require('rate-limiter-flexible');

dotenv.config({ path: '.env' });

// --- Types ---
interface SafetyRelevanceResult {
    isRelevant: boolean;
    reason?: string; // Optional reason for logging
}

interface OpinionRecord {
    id: string; // Assuming UUID or numeric ID from DB
    title: string | null;
    body: string | null;
}

// --- Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const DB_FETCH_BATCH_SIZE = 100; // How many opinions to fetch from DB at once
const DB_UPDATE_BATCH_SIZE = 50; // How many opinions to update in DB at once

// --- Initialization & Validation ---
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('🛑 Missing Supabase URL or Service Key environment variables.');
    process.exit(1);
}
if (!geminiApiKey) {
    console.error("🛑 Missing GEMINI_API_KEY. AI relevance check cannot be performed.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini AI
let genAI;
/** @type {GenerativeModel | null} */
let relevanceModel = null;
try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    relevanceModel = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest', // Use a fast model for classification
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ],
    });
} catch (e) {
    console.error("🛑 Error initializing GoogleGenerativeAI:", e);
    process.exit(1);
}

// Initialize Rate Limiter (Free Tier: 15 RPM, use slightly less)
const relevanceRateLimiter = new RateLimiterMemory({
    points: 14,
    duration: 60,
});
const MAX_AI_RETRIES = 2;
const AI_RETRY_DELAY_MS = 3000;

// --- AI Relevance Check Function (Copied & Adapted) ---
async function isSafetyRelevant(title?: string | null, body?: string | null): Promise<SafetyRelevanceResult> {
    if (!relevanceModel) {
        console.error("   🤖 AI Relevance Check SKIPPED: Model not initialized.");
        return { isRelevant: false, reason: "Model not initialized" };
    }

    const textToAnalyze = `${title || ''} ${body || ''}`.trim(); // Combine title and body safely
    if (!textToAnalyze || textToAnalyze.length < 15) { // Skip very short comments
        return { isRelevant: false, reason: "Too short" };
    }

    const MAX_CHARS_FOR_RELEVANCE = 1000;
    const truncatedText = textToAnalyze.length > MAX_CHARS_FOR_RELEVANCE
        ? textToAnalyze.substring(0, MAX_CHARS_FOR_RELEVANCE) + "..."
        : textToAnalyze;

    const prompt = `Analyze the following text from a discussion about a specific location.\nIs this comment a genuine first-hand opinion, personal experience, observation, or specific advice related DIRECTLY to **personal safety** (feeling safe/unsafe, crime, police presence, dangerous situations, positive safety observations, specific times/places to avoid/prefer for safety)?\n\n**Comment Text:**\n"${truncatedText}"\n\n**Instructions:**\n- Answer ONLY with "YES" or "NO".\n- Answer "YES" if it clearly discusses personal safety experiences or observations.\n- Answer "NO" if it's primarily a question, an argument, meta-commentary, general chat, moving advice NOT about safety, or discusses topics other than personal safety.\n\n**Answer (YES or NO):**`;


    let attempts = 0;
    while (attempts <= MAX_AI_RETRIES) {
        attempts++;
        try {
            await relevanceRateLimiter.consume('gemini_relevance_check');

            const result = await relevanceModel.generateContent(prompt);

            if (result.response.promptFeedback?.blockReason) {
                console.warn(`   🤖 AI Check BLOCKED (Attempt ${attempts}): ${result.response.promptFeedback.blockReason}`);
                return { isRelevant: false, reason: `Blocked: ${result.response.promptFeedback.blockReason}` };
            }

            const responseText = result.response.text()?.trim().toUpperCase();

            if (responseText === 'YES') {
                return { isRelevant: true };
            } else if (responseText === 'NO') {
                return { isRelevant: false, reason: "AI classified as NO" };
            } else {
                console.warn(`   🤖 AI Check: Unexpected response (Attempt ${attempts}): "${result.response.text()}"`);
                if (attempts >= MAX_AI_RETRIES) return { isRelevant: false, reason: "Unexpected AI response" };
            }

        } catch (error: any) {
             console.warn(`   🤖 Error during AI Relevance Check (Attempt ${attempts}):`, error.message || error);
             if (error instanceof RateLimiterRes) {
                 console.warn(`   ⏳ Rate limit hit. Waiting ${Math.ceil(error.msBeforeNext / 1000)}s...`);
                 await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                 attempts--; // Retry without counting this as an attempt
                 continue;
             }
             const isRetryableError = error.status === 429 || error.status >= 500 || (error.message && (error.message.includes('429') || error.message.includes('503')));
             if (!isRetryableError || attempts >= MAX_AI_RETRIES) {
                return { isRelevant: false, reason: `AI call failed: ${error.message || 'Unknown error'}` };
             }
             const delay = AI_RETRY_DELAY_MS * Math.pow(2, attempts - 1);
             console.log(`   Waiting ${delay}ms before AI check retry...`);
             await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { isRelevant: false, reason: "Exceeded max retries" };
}


// --- Main Script Logic ---
async function updateRelevanceForAllOpinions() {
    console.log("🚀 Starting AI Safety Relevance Update Script...");

    let totalChecked = 0;
    let totalRelevant = 0;
    let totalIrrelevant = 0;
    let totalErrors = 0;
    let currentOffset = 0;
    let keepFetching = true;

    while (keepFetching) {
        console.log(`Fetching batch of ${DB_FETCH_BATCH_SIZE} opinions starting from offset ${currentOffset}...`);

        const { data: opinions, error: fetchError } = await supabase
            .from('community_opinions')
            .select('id, title, body') // Select necessary fields
            .is('is_safety_relevant', null) // Fetch only those not yet checked
            .range(currentOffset, currentOffset + DB_FETCH_BATCH_SIZE - 1);

        if (fetchError) {
            console.error("❌ Error fetching opinions:", fetchError.message);
            keepFetching = false; // Stop if we can't fetch
            totalErrors++;
            break;
        }

        if (!opinions || opinions.length === 0) {
            console.log("✅ No more unchecked opinions found.");
            keepFetching = false;
            break;
        }

        console.log(`Processing ${opinions.length} opinions...`);
        let updatesToBatch = [];

        for (const opinion of opinions as OpinionRecord[]) {
            const relevanceResult = await isSafetyRelevant(opinion.title, opinion.body);
            totalChecked++;

            if (relevanceResult.isRelevant) {
                totalRelevant++;
            } else {
                totalIrrelevant++;
                // Log reason for irrelevance if desired
                 if (relevanceResult.reason && relevanceResult.reason !== "AI classified as NO") {
                     console.log(`   -> Marked irrelevant (ID: ${opinion.id}): ${relevanceResult.reason}`);
                 }
            }

            updatesToBatch.push({
                id: opinion.id,
                is_safety_relevant: relevanceResult.isRelevant,
            });

             // Update DB in smaller batches
            if (updatesToBatch.length >= DB_UPDATE_BATCH_SIZE) {
                console.log(`   Updating ${updatesToBatch.length} records in DB...`);
                const { error: updateError } = await supabase
                    .from('community_opinions')
                    .upsert(updatesToBatch); // Use upsert on primary key 'id'

                if (updateError) {
                    console.error(`   ❌ DB Update Error: ${updateError.message}`);
                    totalErrors += updatesToBatch.length; // Count failed updates
                }
                updatesToBatch = []; // Clear batch
            }
             // Small delay between AI calls even within a batch if needed, but rate limiter should handle this
             // await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Update any remaining records in the batch
        if (updatesToBatch.length > 0) {
             console.log(`   Updating remaining ${updatesToBatch.length} records in DB...`);
             const { error: updateError } = await supabase
                 .from('community_opinions')
                 .upsert(updatesToBatch);

             if (updateError) {
                 console.error(`   ❌ DB Update Error: ${updateError.message}`);
                 totalErrors += updatesToBatch.length;
             }
        }


        currentOffset += opinions.length; // Move to the next page for DB fetch

        // If we fetched less than the batch size, it means we're done
        if (opinions.length < DB_FETCH_BATCH_SIZE) {
            keepFetching = false;
        }
    }

    console.log("\n--- Relevance Update Summary ---");
    console.log(`Total Opinions Checked: ${totalChecked}`);
    console.log(`Marked as Relevant:   ${totalRelevant}`);
    console.log(`Marked as Irrelevant: ${totalIrrelevant}`);
    console.log(`Errors during process: ${totalErrors}`);
    console.log("✅ Script finished.");
}

// Run the script
updateRelevanceForAllOpinions().catch(err => {
    console.error("💥 Unhandled top-level error:", err);
    process.exit(1);
});
