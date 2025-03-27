const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { RateLimiterMemory, RateLimiterRes } = require('rate-limiter-flexible');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' }); // Load environment variables

// --- Configuration & Initialization ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("🛑 Missing Supabase URL or Service Key environment variables.");
    process.exit(1);
}
if (!geminiApiKey) {
     console.error("🛑 Missing GEMINI_API_KEY. AI features cannot be generated.");
     process.exit(1); // Exit if AI key is missing, as it's essential for this script
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

let genAI;
let model; // Using 'any' for simplicity

try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });
} catch (e) {
    console.error("🛑 Error initializing GoogleGenerativeAI:", e);
    process.exit(1);
}

// --- Rate Limiting (Memory is OK for a script run manually/infrequently) ---
const rateLimiter = new RateLimiterMemory({
  points: 14, // Set to 14 (slightly below the 15 limit)
  duration: 60, // Per 60 seconds
});

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000; // 5 seconds base delay

// --- Helper: Format Takeaways (Copied from previous API route) ---
function formatTakeaway(takeaway, type) {
    if (!takeaway || typeof takeaway !== 'string' || takeaway.toLowerCase() === 'null' || takeaway.trim() === '') {
        return null;
    }
    let formattedTakeaway = takeaway;
    try { formattedTakeaway = JSON.parse(`"${takeaway}"`); } catch (e) { /* Ignore */ }

    let formatted = formattedTakeaway.replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
    const prefix = type === 'positive' ? '✓' : '⚠️';
    formatted = formatted
        .split('\n')
        .map(line => {
            line = line.trim();
            if (!line) return '';
            line = line.replace(/^✓\s*|^⚠️\s*|^-\s*|^\*\s*/, '').trim();
            return `${prefix} ${line}`;
        })
        .filter(Boolean)
        .join('\n');
    return formatted.trim() || null;
}

// --- Helper: Generate Takeaways via Gemini (Copied from previous API route) ---
async function generateTakeawaysFromOpinions(opinions, locationName) {
    if (!opinions || opinions.length === 0) {
        return { positive_takeaway: null, negative_takeaway: null };
    }
    console.log(`   🧠 Generating takeaways for ${opinions.length} opinions about ${locationName}...`);

    const opinionsText = opinions.map(item => `- Opinion: "${item.body}"`).join('\n');
    const MAX_INPUT_CHARS = 28000;
    const truncatedOpinionsText = opinionsText.length > MAX_INPUT_CHARS
        ? opinionsText.substring(0, MAX_INPUT_CHARS) + "\n- ... [Opinions Truncated] ..."
        : opinionsText;

    const prompt = `You are analyzing community comments about safety in a specific location: "${locationName}".
Your task is to extract ONLY safety-related takeaways for a traveler visiting the area, based *strictly* on the provided comments.

**Provided Comments:**
${truncatedOpinionsText}

**Instructions:**
1.  Read all comments carefully, focusing *only* on safety aspects (positive or negative experiences, warnings, reassurances, mentions of crime, police, feeling safe/unsafe, specific times/places to avoid/prefer for safety reasons).
2.  Ignore irrelevant content (questions, moving advice, general chat, non-safety observations).
3.  Synthesize the relevant safety points into two distinct checklists.
4.  **Format your entire response ONLY as a valid JSON object** like this:
    {
      "positive_takeaway": "✓ Point 1 about safety.\\n✓ Another positive safety observation.",
      "negative_takeaway": "⚠️ Warning about a specific safety issue.\\n⚠️ Mention of a concerning experience."
    }
5.  **Checklist Rules:**
    *   Start positive points with "✓ " (Checkmark + Space).
    *   Start negative points with "⚠️ " (Warning + Space).
    *   Each point must be a **complete, concise sentence** ending with punctuation. No fragments.
    *   State information **directly** (e.g., "Neighborhood X is mentioned as being safe at night.") not indirectly ("A comment implies...").
    *   Use "\\n" between points within the JSON string value.
    *   Include **only points explicitly derived** from the provided comments. Do not add general advice.
    *   If absolutely no relevant positive safety points are found, use null for positive_takeaway.
    *   If absolutely no relevant negative safety points/concerns are found, use null for negative_takeaway.
    *   Aim for 3-5 points per list if possible, but prioritize accuracy over quantity.

**JSON Output Requirement:** Ensure the output begins *immediately* with "{" and ends *immediately* with "}" with no extra text or markdown formatting around the JSON block.`;

    let attempts = 0;
    while (attempts <= MAX_RETRIES) {
        attempts++;
        try {
            await rateLimiter.consume('gemini_takeaways_script'); // Unique key for script

            // console.log(`   📡 Calling Gemini API (Attempt ${attempts})...`); // Verbose
            const result = await model.generateContent(prompt);

             if (result.response.promptFeedback?.blockReason) {
                console.error(`   🛑 Gemini request blocked for ${locationName}: ${result.response.promptFeedback.blockReason}`);
                return { positive_takeaway: null, negative_takeaway: null }; // Don't retry safety blocks
            }
            const responseText = result.response.text();

            try {
                const jsonStart = responseText.indexOf('{');
                const jsonEnd = responseText.lastIndexOf('}');
                if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) throw new Error("JSON markers not found");
                const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
                const parsed = JSON.parse(jsonString);
                if (typeof parsed.positive_takeaway === 'undefined' || typeof parsed.negative_takeaway === 'undefined') throw new Error("Missing keys");

                // console.log(`   ✅ Gemini response parsed for ${locationName}.`); // Verbose
                return {
                    positive_takeaway: formatTakeaway(parsed.positive_takeaway, 'positive'),
                    negative_takeaway: formatTakeaway(parsed.negative_takeaway, 'negative'),
                };
            } catch (parseError) {
                console.error(`   ❌ Error parsing Gemini JSON for ${locationName} (Attempt ${attempts}):`, parseError.message);
                if (attempts >= MAX_RETRIES) throw new Error(`Failed to parse Gemini response after ${attempts} attempts.`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS / 2));
            }
        } catch (error) {
             console.error(`   🛑 Error during Gemini call for ${locationName} (Attempt ${attempts}):`, error.message || error);
             if (error instanceof RateLimiterRes) {
                 console.warn(`   ⏳ Rate limit hit. Waiting ${error.msBeforeNext}ms...`);
                 await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                 attempts--; // Don't count this as a full attempt
                 continue;
             }
             if (error.status === 429 || (error.message && error.message.includes('429'))) {
                  console.warn(`   Received 429. Waiting before retry...`);
             }
             if (attempts >= MAX_RETRIES) break;
             const delay = RETRY_DELAY_MS * Math.pow(2, attempts - 1);
             console.log(`   Waiting ${delay}ms before retry...`);
             await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    console.error(`   🛑 Failed to generate takeaways for ${locationName} after all retries.`);
    return { positive_takeaway: null, negative_takeaway: null };
}

// --- Main Script Logic ---
async function generateAllTakeaways() {
    console.log("🚀 Starting takeaway generation script using Census Blocks...");
    const CITY_ID_TO_PROCESS = 1; // Assuming 1 is Los Angeles
    const BATCH_SIZE = 100; // How many upserts to batch together

    // 1. Fetch all relevant census blocks
    console.log(`Fetching census blocks for city_id ${CITY_ID_TO_PROCESS}...`);
    const { data: censusBlocks, error: blockError } = await supabase
        .from('census_blocks')
        .select('id') // Only need the ID initially
        .eq('city_id', CITY_ID_TO_PROCESS);

    if (blockError) {
        console.error("❌ Error fetching census blocks:", blockError.message);
        return;
    }
    if (!censusBlocks || censusBlocks.length === 0) {
        console.log(`🟡 No census blocks found for city_id ${CITY_ID_TO_PROCESS}.`);
        return;
    }
    console.log(`✅ Found ${censusBlocks.length} census blocks.`);

    let generatedCount = 0;
    let skippedNoOpinions = 0;
    let skippedNoCentroid = 0;
    let errorCount = 0;
    const radiusMeters = 2000;
    const opinionLimit = 100;
    let takeawaysToUpsert = []; // Array to hold data for batch upsert

    // Process census blocks sequentially
    for (let i = 0; i < censusBlocks.length; i++) {
        const block = censusBlocks[i];
        const blockId = block.id;
        console.log(`--- Processing Block ${i + 1}/${censusBlocks.length}: ${blockId} ---`);

        try {
            // 2. Get Centroid Coordinates
            const { data: centroidData, error: centroidError } = await supabase
                .rpc('get_block_centroid', { block_id: blockId })
                .maybeSingle();

            if (centroidError) {
                console.error(`   ❌ Error fetching centroid for block ${blockId}:`, centroidError.message);
                errorCount++;
                continue;
            }
            if (!centroidData || centroidData.latitude === null || centroidData.longitude === null) {
                console.warn(`   🟡 Could not find valid centroid for block ${blockId}. Skipping.`);
                skippedNoCentroid++;
                continue;
            }

            const { latitude, longitude } = centroidData;
            const locationName = `Census Block ${blockId} area`;

            // 3. Fetch opinions
            const { data: opinions, error: opinionError } = await supabase
                .rpc('get_opinions_within_radius', {
                    target_lat: latitude,
                    target_lon: longitude,
                    radius_meters: radiusMeters,
                    opinion_limit: opinionLimit
                });

            if (opinionError) {
                console.error(`   ❌ Error fetching opinions for block ${blockId}:`, opinionError.message);
                errorCount++;
                continue;
            }

            const opinionCount = opinions?.length || 0;

            // 4. Generate Takeaways
            let takeaways = { positive_takeaway: null, negative_takeaway: null };
            if (opinionCount > 0) {
                takeaways = await generateTakeawaysFromOpinions(opinions, locationName);
                generatedCount++;
            } else {
                console.log(`   🟡 No opinions found for block ${blockId}, skipping generation.`);
                skippedNoOpinions++;
            }

            // 5. Prepare data for upsert (add to batch array)
            const expiresAt = new Date();
            const cacheDurationDays = (takeaways.positive_takeaway || takeaways.negative_takeaway) ? 30 : 1;
            expiresAt.setDate(expiresAt.getDate() + cacheDurationDays);

            takeawaysToUpsert.push({
                latitude: latitude,
                longitude: longitude,
                radius: radiusMeters,
                positive_takeaway: takeaways.positive_takeaway,
                negative_takeaway: takeaways.negative_takeaway,
                expires_at: expiresAt.toISOString(),
                generation_model: 'gemini-2.0-flash',
                opinion_count: opinionCount,
            });

            // 6. Perform batch upsert when batch is full or it's the last item
            if (takeawaysToUpsert.length >= BATCH_SIZE || i === censusBlocks.length - 1) {
                console.log(`   💾 Upserting batch of ${takeawaysToUpsert.length} takeaways...`);
                const { error: upsertError } = await supabase
                    .from('community_takeaways')
                    .upsert(takeawaysToUpsert, {
                        onConflict: 'latitude, longitude, radius'
                    });

                if (upsertError) {
                    console.error(`   ❌ Error upserting batch:`, upsertError.message);
                    // Note: Consider adding more robust error handling here,
                    // maybe retry the batch or log failed items.
                    errorCount += takeawaysToUpsert.length; // Count all items in failed batch as errors
                } else {
                    // console.log(`   ✅ Batch upsert successful.`); // Verbose
                }
                takeawaysToUpsert = []; // Clear the batch array
            }

        } catch (processError) {
            console.error(`   💥 Unhandled error processing block ${blockId}:`, processError.message || processError);
            errorCount++;
        }
         // --- Add a small delay between processing each block ---
         // Helps spread out requests even further, reducing burstiness.
         // ~4 seconds delay aims for roughly 15 requests per minute (60 / 15 = 4).
         await new Promise(resolve => setTimeout(resolve, 4000));
         // --- End Add Delay ---
    }

    // Final Summary
    console.log("\n--- Generation Summary ---");
    console.log(`Total Census Blocks Processed: ${censusBlocks.length}`);
    console.log(`Takeaways Generated/Attempted: ${generatedCount}`);
    console.log(`Skipped (No Opinions): ${skippedNoOpinions}`);
    console.log(`Skipped (No Centroid): ${skippedNoCentroid}`);
    console.log(`Errors Encountered: ${errorCount}`);
    console.log("✅ Script finished.");
}

// Run the script
generateAllTakeaways(); 