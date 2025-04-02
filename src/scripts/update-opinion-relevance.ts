const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
// Removed GoogleGenerativeAI imports
const { RateLimiterMemory, RateLimiterRes } = require('rate-limiter-flexible');
// Assuming Node.js v18+ which has built-in fetch.
// If using older Node, you might need 'node-fetch':
// const fetch = require('node-fetch'); // Uncomment if needed

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
const deepseekApiKey = process.env.DEEPSEEK_API_KEY; // Changed from GEMINI_API_KEY
const DB_FETCH_BATCH_SIZE = 100; // How many opinions to fetch from DB at once
const DB_UPDATE_BATCH_SIZE = 50; // How many opinions to update in DB at once
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // Or choose another appropriate model like 'deepseek-coder' if relevant

// --- Initialization & Validation ---
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('🛑 Missing Supabase URL or Service Key environment variables.');
    process.exit(1);
}
// Updated API key check
if (!deepseekApiKey) {
    console.error("🛑 Missing DEEPSEEK_API_KEY. AI relevance check cannot be performed.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Removed Gemini AI Initialization

// Initialize Rate Limiter (Adjust based on DeepSeek's limits if needed)
// Kept Gemini's 15 RPM free tier limit (using 14) as a starting point.
const relevanceRateLimiter = new RateLimiterMemory({
    points: 14,
    duration: 60, // Per minute
});
const MAX_AI_RETRIES = 2;
const AI_RETRY_DELAY_MS = 3000;

// --- AI Relevance Check Function (Adapted for DeepSeek) ---
async function isSafetyRelevant(title?: string | null, body?: string | null): Promise<SafetyRelevanceResult> {
    // Removed relevanceModel check, now checking API key directly earlier

    const textToAnalyze = `${title || ''} ${body || ''}`.trim(); // Combine title and body safely
    if (!textToAnalyze || textToAnalyze.length < 15) { // Skip very short comments
        return { isRelevant: false, reason: "Too short" };
    }

    const MAX_CHARS_FOR_RELEVANCE = 1000; // Keep truncation consistent
    const truncatedText = textToAnalyze.length > MAX_CHARS_FOR_RELEVANCE
        ? textToAnalyze.substring(0, MAX_CHARS_FOR_RELEVANCE) + "..."
        : textToAnalyze;

    // Keep the same prompt, should work well for classification
    const prompt = `Analyze the following text from a discussion about a specific location.\nIs this comment a genuine first-hand opinion, personal experience, observation, or specific advice related DIRECTLY to **personal safety** (feeling safe/unsafe, crime, police presence, dangerous situations, positive safety observations, specific times/places to avoid/prefer for safety)?\n\n**Comment Text:**\n"${truncatedText}"\n\n**Instructions:**\n- Answer ONLY with "YES" or "NO".\n- Answer "YES" if it clearly discusses personal safety experiences or observations.\n- Answer "NO" if it's primarily a question, an argument, meta-commentary, general chat, moving advice NOT about safety, or discusses topics other than personal safety.\n\n**Answer (YES or NO):**`;

    let attempts = 0;
    while (attempts <= MAX_AI_RETRIES) {
        attempts++;
        try {
            // Consume rate limit point before making the API call
            await relevanceRateLimiter.consume('deepseek_relevance_check'); // Changed key name slightly

            console.log(`   📞 Calling DeepSeek API (Attempt ${attempts})...`); // Log API call attempt

            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekApiKey}`,
                },
                body: JSON.stringify({
                    model: DEEPSEEK_MODEL,
                    messages: [
                        // Optional system message (can sometimes help guide the model)
                        // { role: "system", content: "You are a helpful assistant classifying text relevance." },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 5, // Only need YES or NO
                    temperature: 0.1, // Low temperature for deterministic classification
                    // stream: false // Default is false
                }),
                // Add a timeout (e.g., 30 seconds)
                 signal: AbortSignal.timeout(30000) // 30 seconds timeout
            });

            if (!response.ok) {
                // Throw an error with status code for retry logic
                const errorBody = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
            }

            const data = await response.json();

            // Extract the response text from DeepSeek's format
            const responseText = data?.choices?.[0]?.message?.content?.trim().toUpperCase();

            console.log(`   🤖 DeepSeek Raw Response: "${data?.choices?.[0]?.message?.content}"`); // Log raw response

            // Removed Gemini-specific block reason check

            if (responseText === 'YES') {
                return { isRelevant: true };
            } else if (responseText === 'NO') {
                return { isRelevant: false, reason: "AI classified as NO" };
            } else {
                console.warn(`   🤖 DeepSeek Check: Unexpected response (Attempt ${attempts}): "${responseText}"`);
                if (attempts >= MAX_AI_RETRIES) return { isRelevant: false, reason: "Unexpected AI response" };
                 // Continue to retry logic below
            }

        } catch (error: any) {
             console.warn(`   🤖 Error during DeepSeek Relevance Check (Attempt ${attempts}):`, error.message || error);

             // Handle rate limit errors specifically from the rate limiter library
             if (error instanceof RateLimiterRes) {
                 console.warn(`   ⏳ Rate limit hit (local). Waiting ${Math.ceil(error.msBeforeNext / 1000)}s...`);
                 await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                 attempts--; // Retry without counting this as an attempt
                 continue; // Skip the rest of the loop and retry the API call
             }

              // Check for common retryable HTTP status codes (like 429 Too Many Requests, 5xx Server Errors)
             // The error message now includes the status code from our thrown error
             const statusMatch = error.message?.match(/status (\d+)/);
             const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;
             const isRetryableError = statusCode === 429 || statusCode >= 500 || error.name === 'TimeoutError'; // Added TimeoutError

             if (!isRetryableError || attempts >= MAX_AI_RETRIES) {
                return { isRelevant: false, reason: `AI call failed: ${error.message || 'Unknown error'}` };
             }

             // Implement exponential backoff
             const delay = AI_RETRY_DELAY_MS * Math.pow(2, attempts - 1);
             console.log(`   ⏳ Waiting ${delay / 1000}s before DeepSeek check retry...`);
             await new Promise(resolve => setTimeout(resolve, delay));
             // Continue loop to retry
        }
    }
    // If loop finishes without success
    return { isRelevant: false, reason: "Exceeded max retries" };
}


// --- Main Script Logic (Mostly Unchanged) ---
async function updateRelevanceForAllOpinions() {
    console.log("🚀 Starting DeepSeek Safety Relevance Update Script..."); // Updated log message

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
            console.log(`   Checking relevance for opinion ID: ${opinion.id}...`); // Log stays the same
            const relevanceResult = await isSafetyRelevant(opinion.title, opinion.body); // Calls the adapted function
            totalChecked++;

            if (relevanceResult.isRelevant) {
                totalRelevant++;
                console.log(`   -> Relevant (ID: ${opinion.id})`); // Log stays the same
            } else {
                totalIrrelevant++;
                const reason = relevanceResult.reason || 'Unknown';
                console.log(`   -> Irrelevant (ID: ${opinion.id}): ${reason}`); // Log stays the same
                // Keep detailed logging for non-standard reasons
                 if (relevanceResult.reason && relevanceResult.reason !== "AI classified as NO" && reason !== "Too short" && !reason.startsWith("AI call failed") && !reason.startsWith("Exceeded max retries") && !reason.startsWith("Unexpected AI response")) {
                     console.log(`   -> Detailed Irrelevant Reason (ID: ${opinion.id}): ${relevanceResult.reason}`);
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
                } else {
                    console.log(`   ✅ DB Batch Update Successful (${updatesToBatch.length} records).`);
                }
                updatesToBatch = []; // Clear batch
            }
             // Small delay between AI calls is handled by the rate limiter now
             // await new Promise(resolve => setTimeout(resolve, 50)); // Removed unnecessary small delay
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
             } else {
                 console.log(`   ✅ Final DB Batch Update Successful (${updatesToBatch.length} records).`);
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