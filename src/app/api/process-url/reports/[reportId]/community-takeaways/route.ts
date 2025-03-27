// src/app/api/reports/[reportId]/community-takeaways/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// IMPORTANT: Choose the right RateLimiter for production (Redis/Postgres)
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
// If using Redis: import { RateLimiterRedis } from 'rate-limiter-flexible';
// If using Redis: import Redis from 'ioredis';

// --- Initialization ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase URL or Service Key environment variables.");
}
if (!geminiApiKey) {
     console.warn("Missing GEMINI_API_KEY. AI features will be disabled.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

let genAI: GoogleGenerativeAI | null = null;
let model: any = null; // Using 'any' for simplicity, replace with actual Gemini type if known

if (geminiApiKey) {
  try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash', // Or 'gemini-pro' etc.
      safetySettings: [ // Adjust thresholds as needed
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
      // generationConfig: { // Optional: Control output randomness, length etc.
      //   temperature: 0.7,
      //   maxOutputTokens: 1024,
      // }
    });
  } catch (e) {
      console.error("🛑 Error initializing GoogleGenerativeAI:", e);
      genAI = null; model = null; // Ensure AI is disabled if init fails
  }
}

// --- Rate Limiting ---
// ❗❗❗ WARNING: RateLimiterMemory IS NOT SUITABLE FOR PRODUCTION on Vercel/Serverless. ❗❗❗
// Replace with RateLimiterRedis or RateLimiterPostgres for multi-instance environments.
// Example (Memory - for local dev ONLY):
const rateLimiter = new RateLimiterMemory({
  points: 50, // Max requests (match Gemini QPM, e.g., 60)
  duration: 60, // Per 60 seconds
});

/*
// Example (Redis - REQUIRES a Redis instance URL in env vars):
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_gemini_takeaways',
  points: 50,
  duration: 60,
  blockDuration: 60 * 5 // Optional: block for 5 mins if limit exceeded
});
*/

const MAX_RETRIES = 2; // Reduced retries
const RETRY_DELAY_MS = 3000; // Base delay

// --- Types ---
interface Takeaways {
  positive_takeaway: string | null;
  negative_takeaway: string | null;
}
interface CommunityOpinion {
  body: string;
  source_created_at?: string; // Keep if needed by prompt, otherwise remove
}

// --- Helper: Format Takeaways ---
function formatTakeaway(takeaway: string | null, type: 'positive' | 'negative'): string | null {
    if (!takeaway || typeof takeaway !== 'string' || takeaway.toLowerCase() === 'null' || takeaway.trim() === '') {
        return null;
    }
    // Decode potential unicode escapes just in case
    let formattedTakeaway = takeaway;
    try {
        formattedTakeaway = JSON.parse(`"${takeaway}"`);
    } catch (e) { /* Ignore parse error if it's not a JSON encoded string */ }

    let formatted = formattedTakeaway.replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
    const prefix = type === 'positive' ? '✓' : '⚠️';
    formatted = formatted
        .split('\n')
        .map(line => {
            line = line.trim();
            if (!line) return '';
            // Remove existing prefix (any common variants) and extra whitespace, then add correct one
            line = line.replace(/^✓\s*|^⚠️\s*|^-\s*|^\*\s*/, '').trim();
            return `${prefix} ${line}`;
        })
        .filter(Boolean) // Remove empty lines
        .join('\n');
    return formatted.trim() || null; // Return null if it becomes empty after formatting
}


// --- Helper: Generate Takeaways via Gemini ---
async function generateTakeawaysFromOpinions(opinions: CommunityOpinion[], locationName: string): Promise<Takeaways> {
    if (!model) {
        console.error("AI model not available for takeaway generation.");
        return { positive_takeaway: null, negative_takeaway: null };
    }
    if (!opinions || opinions.length === 0) {
        return { positive_takeaway: null, negative_takeaway: null }; // No input, no output
    }

    console.log(`🧠 Generating takeaways for ${opinions.length} opinions about ${locationName}...`);

    // Prepare content, limiting total length
    const opinionsText = opinions.map(item => `- Opinion: "${item.body}"`).join('\n');
    const MAX_INPUT_CHARS = 28000; // Stay safely within limits (Gemini 1.5 has huge context, but keep it reasonable)
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

    // Retry loop
    let attempts = 0;
    while (attempts <= MAX_RETRIES) {
        attempts++;
        try {
            // Rate limit check
            try {
                 await rateLimiter.consume('gemini_api_takeaways'); // Key specific to this use case
            } catch (rlError: any) {
                 if (rlError instanceof RateLimiterRes) {
                     console.warn(`⏳ Rate limit hit. Waiting ${rlError.msBeforeNext}ms...`);
                     await new Promise(resolve => setTimeout(resolve, rlError.msBeforeNext));
                     attempts--; // Don't count this as a full attempt against MAX_RETRIES
                     continue; // Retry the attempt after waiting
                 } else {
                     throw rlError; // Re-throw other rate limiter errors
                 }
            }

            console.log(`📡 Calling Gemini API (Attempt ${attempts}/${MAX_RETRIES + 1})...`);
            const result = await model.generateContent(prompt);

            // Handle potential safety blocks before accessing text()
             if (result.response.promptFeedback?.blockReason) {
                console.error(`🛑 Gemini request blocked due to safety settings: ${result.response.promptFeedback.blockReason}`);
                // Consider logging the problematic content snippet if possible, carefully
                return { positive_takeaway: null, negative_takeaway: null }; // Don't retry safety blocks
            }

            const responseText = result.response.text();

            // Robust JSON Parsing
            try {
                // Find the start and end of the JSON object
                const jsonStart = responseText.indexOf('{');
                const jsonEnd = responseText.lastIndexOf('}');
                if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
                    throw new Error("Valid JSON object markers not found in response.");
                }
                const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
                const parsed = JSON.parse(jsonString);

                // Validate expected keys
                if (typeof parsed.positive_takeaway === 'undefined' || typeof parsed.negative_takeaway === 'undefined') {
                   throw new Error("Parsed JSON missing required 'positive_takeaway' or 'negative_takeaway' keys.");
                }

                console.log("✅ Gemini response parsed successfully.");
                return {
                    positive_takeaway: formatTakeaway(parsed.positive_takeaway, 'positive'),
                    negative_takeaway: formatTakeaway(parsed.negative_takeaway, 'negative'),
                };
            } catch (parseError: any) {
                console.error(`❌ Error parsing Gemini JSON (Attempt ${attempts}):`, parseError.message);
                console.error("   Raw Response Text:", responseText.substring(0, 500) + "..."); // Log snippet
                if (attempts >= MAX_RETRIES) {
                     console.error("   Max parse retries reached. Giving up.");
                     throw new Error(`Failed to parse Gemini response after ${attempts} attempts.`);
                }
                // Wait briefly before retrying on parse error
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS / 2));
                // Continue to next iteration of the while loop for retry
            }

        } catch (error: any) {
             console.error(`🛑 Error during Gemini API call or processing (Attempt ${attempts}):`, error.message || error);
             // Handle specific Gemini API errors (e.g., 429) if not automatically handled by rate limiter
             if (error.status === 429 || (error.message && error.message.includes('429'))) {
                  console.warn(`   Received 429 (Too Many Requests). Waiting before retry...`);
                  // Fall through to generic retry logic with backoff
             }
             // Other potential errors (network, authentication, etc.)

             // Generic Retry Logic with Exponential Backoff
             if (attempts >= MAX_RETRIES) {
                console.error("   Max retries reached for Gemini API call. Giving up.");
                break; // Exit loop
             }
             const delay = RETRY_DELAY_MS * Math.pow(2, attempts - 1); // Exponential backoff
             console.log(`   Waiting ${delay}ms before retry...`);
             await new Promise(resolve => setTimeout(resolve, delay));
        }
    } // End while loop

    // If loop finishes without returning, it failed
    console.error("🛑 Failed to generate takeaways after all retries.");
    return { positive_takeaway: null, negative_takeaway: null };
}


// --- API Route Handler (GET) ---
export async function GET(
    request: NextRequest,
    { params }: { params: { reportId: string } }
) {
    const reportId = params.reportId;
    console.log(`API: Received request for community takeaways, reportId: ${reportId}`);

    // --- Authentication Check ---
    // Replace this with your actual Supabase authentication check
    // Needed to prevent unauthenticated access as per PRD
    const isAuthenticated = true; // <<< !!! REPLACE WITH REAL AUTH CHECK !!!
    // Example: Use Supabase Auth Helpers or SSR package to get session/user
    // const supabaseAuth = createRouteHandlerClient({ cookies }); // Example
    // const { data: { session } } = await supabaseAuth.auth.getSession();
    // const isAuthenticated = !!session;

    if (!isAuthenticated) {
       console.warn("API: Denying access - Authentication required.");
       return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    // --- End Authentication Check ---

    if (!reportId) {
        return NextResponse.json({ success: false, error: 'Missing reportId parameter' }, { status: 400 });
    }
    if (!geminiApiKey || !model) {
        console.error("API: AI Service unavailable (Missing API Key or Init Error).");
        return NextResponse.json({ success: false, error: 'AI Service unavailable' }, { status: 503 });
    }

    try {
        // 1. Get Accommodation Location
        console.log(`API: Fetching accommodation location for ID: ${reportId}`);
        const { data: accommodation, error: accomError } = await supabase
            .from('accommodations')
            .select('latitude, longitude, name, neighborhood') // Fetch fields for context
            .eq('id', reportId)
            .single();

        if (accomError || !accommodation?.latitude || !accommodation?.longitude) {
            console.error(`API: Accommodation fetch error for ${reportId}:`, accomError?.message || 'Not found or missing coordinates');
            const status = accomError?.code === 'PGRST116' ? 404 : 500; // PGRST116: Row not found
            return NextResponse.json({ success: false, error: `Accommodation not found or location missing` }, { status });
        }
        console.log(`API: Found location [${accommodation.latitude}, ${accommodation.longitude}]`);

        const { latitude, longitude } = accommodation;
        const locationName = accommodation.name || accommodation.neighborhood || `location near [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`;
        const radiusMeters = 2000; // 2km search radius

        // 2. Check Cache
        const nowISO = new Date().toISOString();
        console.log(`API: Checking cache for [${latitude}, ${longitude}], radius ${radiusMeters}`);
        const { data: cachedTakeaways, error: cacheError } = await supabase
            .from('community_takeaways')
            .select('positive_takeaway, negative_takeaway, created_at')
            .eq('latitude', latitude)
            .eq('longitude', longitude)
            .eq('radius', radiusMeters)
            .gt('expires_at', nowISO) // Check if not expired
            .order('created_at', { ascending: false }) // Get the latest valid cache entry
            .limit(1)
            .maybeSingle(); // Returns null if no matching row, doesn't throw error

        if (cacheError) {
            console.error('API: Cache check database error:', cacheError.message);
            // Log error but proceed to generate if possible
        }

        if (cachedTakeaways) {
            console.log(`API: ✅ Cache hit! Returning cached takeaways created at ${cachedTakeaways.created_at}`);
            return NextResponse.json({
                success: true,
                takeaways: {
                    positive_takeaway: cachedTakeaways.positive_takeaway,
                    negative_takeaway: cachedTakeaways.negative_takeaway,
                },
                source: 'cache',
                cached_at: cachedTakeaways.created_at,
            });
        }

        console.log(`API: 🟡 Cache miss. Proceeding to generate takeaways.`);

        // 3. Fetch Opinions (RPC call using the DB function)
        console.log(`API: Fetching opinions via RPC within ${radiusMeters}m...`);
        const OPINION_LIMIT = 100; // Limit number of opinions passed to AI
        const { data: opinions, error: opinionError } = await supabase
            .rpc('get_opinions_within_radius', {
                target_lat: latitude,
                target_lon: longitude,
                radius_meters: radiusMeters,
                opinion_limit: OPINION_LIMIT
            });

        if (opinionError) {
            console.error('API: Opinion fetch RPC error:', opinionError.message);
            return NextResponse.json({ success: false, error: 'Failed to fetch community opinions' }, { status: 500 });
        }
        const opinionCount = opinions?.length || 0;
        console.log(`API: Found ${opinionCount} opinions nearby.`);

        // 4. Generate Takeaways
        let generatedTakeaways: Takeaways = { positive_takeaway: null, negative_takeaway: null };
        if (opinionCount > 0) {
            generatedTakeaways = await generateTakeawaysFromOpinions(opinions as CommunityOpinion[], locationName);
        } else {
            console.log(`API: No relevant opinions found to generate takeaways.`);
            // Intentionally caching null result below
        }

        // 5. Store Result (even nulls) in Cache
        console.log(`API: Storing result in cache...`);
        const expiresAt = new Date();
        // Cache valid results longer (30 days), null results shorter (1 day)
        const cacheDurationDays = (generatedTakeaways.positive_takeaway || generatedTakeaways.negative_takeaway) ? 30 : 1;
        expiresAt.setDate(expiresAt.getDate() + cacheDurationDays);

        const { error: insertError } = await supabase
            .from('community_takeaways')
            .insert({
                latitude: latitude,
                longitude: longitude,
                radius: radiusMeters,
                positive_takeaway: generatedTakeaways.positive_takeaway,
                negative_takeaway: generatedTakeaways.negative_takeaway,
                expires_at: expiresAt.toISOString(),
                generation_model: model?.model || 'unknown', // Store model name if available
                opinion_count: opinionCount,
            });

        if (insertError) {
            console.error('API: Failed to cache generated takeaways:', insertError.message);
            // Log error, but still return the generated result to the user this time
        } else {
            console.log(`API: ✅ Successfully cached takeaways, expiring in ${cacheDurationDays} day(s).`);
        }

        // 6. Return Generated Takeaways
        console.log("API: Returning newly generated takeaways.");
        return NextResponse.json({
            success: true,
            takeaways: generatedTakeaways,
            source: 'generated',
            opinions_analyzed: opinionCount
        });

    } catch (error: any) {
        console.error('API: 💥 Unhandled error in community-takeaways GET handler:', error);
        return NextResponse.json({ success: false, error: 'Internal server error processing request' }, { status: 500 });
    }
}