const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
// Removed GoogleGenerativeAI imports
const { RateLimiterRes } = require('rate-limiter-flexible');
// Import p-limit correctly for require
const pLimit = require('p-limit').default;
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
    // Add fields needed for upsert due to NOT NULL constraints
    source: string;
    external_id: string;
}

// --- Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY; // Changed from GEMINI_API_KEY
const DB_FETCH_BATCH_SIZE = 100; // How many opinions to fetch from DB at once
const DB_UPDATE_BATCH_SIZE = 50; // How many opinions to update in DB at once
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // Or choose another appropriate model like 'deepseek-coder' if relevant
// Concurrency setting for parallel processing
const MAX_CONCURRENT_AI_CALLS = 10;

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

// Initialize p-limit (Concurrency control)
const limit = pLimit(MAX_CONCURRENT_AI_CALLS);

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
            console.log(`   📞 Calling DeepSeek API (Attempt ${attempts})...`);

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

             // Keep RateLimiterRes check in case it somehow still triggers or for future use
             if (error instanceof RateLimiterRes) {
                 console.warn(`   ⏳ Rate limit hit (local). Waiting ${Math.ceil(error.msBeforeNext / 1000)}s...`);
                 await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                 attempts--;
                 continue;
             }

              // Check for common retryable HTTP status codes (like 429 Too Many Requests, 5xx Server Errors)
             // The error message now includes the status code from our thrown error
             const statusMatch = error.message?.match(/status (\d+)/);
             const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;
             // Handle null statusCode case explicitly with nullish coalescing
             const isRetryableError = (statusCode ?? 0) === 429 || (statusCode ?? 0) >= 500 || error.name === 'TimeoutError';

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


// --- Main Script Logic (Refactored for Parallelism) ---
async function updateRelevanceForAllOpinions() {
    console.log(`🚀 Starting DeepSeek Safety Relevance Update Script (Concurrency: ${MAX_CONCURRENT_AI_CALLS})...`);

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
            // Select additional required fields for upsert
            .select('id, title, body, source, external_id')
            .is('is_safety_relevant', null) // Check for NULL in the boolean column
            .range(currentOffset, currentOffset + DB_FETCH_BATCH_SIZE - 1);

        if (fetchError) {
            console.error("❌ Error fetching opinions:", fetchError.message);
            keepFetching = false;
            totalErrors++;
            break;
        }

        if (!opinions || opinions.length === 0) {
            console.log("✅ No more unchecked opinions found.");
            keepFetching = false;
            break;
        }

        console.log(`Processing ${opinions.length} opinions in parallel (limit ${MAX_CONCURRENT_AI_CALLS})...`);

        // Create tasks for p-limit
        const tasks = (opinions as OpinionRecord[]).map(opinion => {
            // Wrap the async isSafetyRelevant call in the limiter
            return limit(async () => {
                // console.log(`   -> Starting check for ID: ${opinion.id}`); // More verbose logging if needed
                const relevanceResult = await isSafetyRelevant(opinion.title, opinion.body);
                // Return original opinion data along with result for easy upsert
                return { ...opinion, relevanceResult };
            });
        });

        // Execute tasks in parallel, respecting the concurrency limit
        const results = await Promise.all(tasks);
        console.log(`   Batch of ${results.length} AI checks completed.`);

        // Process results and prepare DB updates
        let updatesToBatch = [];
        for (const item of results) {
            totalChecked++;
            if (item.relevanceResult.isRelevant) {
                totalRelevant++;
                 console.log(`   -> Relevant (ID: ${item.id})`);
            } else {
                totalIrrelevant++;
                const reason = item.relevanceResult.reason || 'Unknown';
                 console.log(`   -> Irrelevant (ID: ${item.id}): ${reason}`);
                 if (item.relevanceResult.reason && item.relevanceResult.reason !== "AI classified as NO" && reason !== "Too short" && !reason.startsWith("AI call failed") && !reason.startsWith("Exceeded max retries") && !reason.startsWith("Unexpected AI response")) {
                     console.log(`   -> Detailed Irrelevant Reason (ID: ${item.id}): ${item.relevanceResult.reason}`);
                 }
            }
            // Include all necessary fields for upsert
            updatesToBatch.push({
                id: item.id,
                source: item.source, // Include source
                external_id: item.external_id, // Include external_id
                title: item.title, // Include title
                body: item.body, // Include body
                is_safety_relevant: item.relevanceResult.isRelevant,
            });
        }

        // Update DB in batches
        for (let i = 0; i < updatesToBatch.length; i += DB_UPDATE_BATCH_SIZE) {
            const batch = updatesToBatch.slice(i, i + DB_UPDATE_BATCH_SIZE);
            console.log(`   Updating ${batch.length} records in DB...`);
            const { error: updateError } = await supabase
                .from('community_opinions')
                .upsert(batch);

            if (updateError) {
                console.error(`   ❌ DB Update Error: ${updateError.message}`);
                // Optionally, log the batch that failed
                // console.error('Failed batch:', batch);
                totalErrors += batch.length; // Increment error count for the failed batch
                // Decide if you want to continue to the next batch or stop
                // continue; // or break;
            } else {
                // console.log(`   ✅ Successfully updated batch ${i / DB_UPDATE_BATCH_SIZE + 1}`);
            }
        }

        // Update offset for the next fetch
        currentOffset += opinions.length;

        if (opinions.length < DB_FETCH_BATCH_SIZE) {
            keepFetching = false;
        }
    }

    // Final Summary (unchanged)
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