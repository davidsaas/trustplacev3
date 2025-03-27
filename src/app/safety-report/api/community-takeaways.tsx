import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'; // Or use RateLimiterRedis for multi-instance deployments

// Initialize Supabase client (use environment variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Use service role key for server-side
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Initialize Google Generative AI (use environment variable)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;
let model: any = null; // Adjust type as per Gemini SDK if needed

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash', // Or your preferred model
    safetySettings: [ // Example safety settings - adjust as needed
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
    // Consider generationConfig like temperature, maxOutputTokens if needed
  });
} else {
  console.error("Missing GEMINI_API_KEY environment variable. AI Takeaways will not function.");
}

// --- Rate Limiting ---
// IMPORTANT: RateLimiterMemory works ONLY for single-instance deployments.
// For Vercel/serverless/multi-instance, use RateLimiterRedis or RateLimiterPostgres.
// Example with memory (adjust points/duration as needed for Gemini limits)
const rateLimiter = new RateLimiterMemory({
  points: 50, // Max requests (adjust based on Gemini's actual limits, e.g., 60 QPM)
  duration: 60, // Per 60 seconds (1 minute)
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

// --- Helper Types ---
interface Takeaways {
  positive_takeaway: string | null;
  negative_takeaway: string | null;
}

interface CommunityOpinion {
  body: string;
  source_created_at?: string; // Optional: for context if needed
}

// --- Core Generation Logic (Adapted from previous code) ---

async function generateTakeawaysFromOpinions(
  opinions: CommunityOpinion[],
  locationName: string
): Promise<Takeaways> {
  if (!model) {
    console.error("Gemini model not initialized due to missing API key.");
    return { positive_takeaway: null, negative_takeaway: null };
  }
  if (!opinions || opinions.length === 0) {
    console.log('No opinions provided to generateTakeaways');
    return { positive_takeaway: null, negative_takeaway: null };
  }

  console.log(`Generating takeaways for ${opinions.length} opinions about ${locationName}`);

  const opinionsText = opinions
    .map(item => `Opinion: "${item.body}"`)
    .join('\n\n');

  // Limit total text length if necessary (Gemini has large context, but be mindful)
  const MAX_INPUT_LENGTH = 30000; // Adjust as needed
  const truncatedOpinionsText = opinionsText.length > MAX_INPUT_LENGTH
    ? opinionsText.substring(0, MAX_INPUT_LENGTH) + "..."
    : opinionsText;

  const prompt = `Analyze the following community opinions regarding safety in ${locationName}. Create two specific lists of takeaways for travelers:

${truncatedOpinionsText}

Instructions:
- Focus strictly on safety-related comments, experiences, and advice mentioned in the opinions.
- Ignore questions, unrelated discussions, or opinions not about safety.
- Synthesize recurring themes and specific points.

Create exactly two lists:
1. WHAT'S GOOD: A checklist of positive safety aspects or reassurances mentioned (prefix each point with "✓").
2. WATCH OUT FOR: A checklist of safety concerns, warnings, or negative experiences mentioned (prefix each point with "⚠️").

Formatting Rules:
- Respond ONLY with a valid JSON object in the format:
  {
    "positive_takeaway": "✓ Point 1\\n✓ Point 2\\n...",
    "negative_takeaway": "⚠️ Point 1\\n⚠️ Point 2\\n..."
  }
- Each point MUST be a concise but complete sentence ending with punctuation. No fragments.
- State points directly. Do not use phrases like "Someone mentioned..." or "Comments suggest...".
- Use "✓" for positive points and "⚠️" for negative points, followed by a space.
- Each point on a new line (use '\\n' in the JSON string).
- If no relevant points exist for a list, use null for that value (e.g., "positive_takeaway": null).
- Aim for 3-5 points per list if possible, but ONLY include points genuinely derived from the provided opinions.
- DO NOT include generic advice unless it's explicitly mentioned in the opinions.
- Filter out user questions present in the input opinions; focus on statements and experiences.
- IMPORTANT: Ensure the final output is just the JSON object, nothing else before or after.`;

  let attempts = 0;
  while (attempts <= MAX_RETRIES) {
    attempts++;
    try {
      // Consume rate limit point
      await rateLimiter.consume('gemini_api'); // Use a consistent key

      console.log(`Calling Gemini API (Attempt ${attempts})...`);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Try parsing the JSON response
      try {
        const parsed = JSON.parse(responseText);
        return {
          positive_takeaway: formatTakeaway(parsed.positive_takeaway, 'positive'),
          negative_takeaway: formatTakeaway(parsed.negative_takeaway, 'negative'),
        };
      } catch (parseError) {
        console.error(`Error parsing Gemini JSON (Attempt ${attempts}):`, parseError, 'Response Text:', responseText);
        // Attempt simple regex extraction as fallback ONLY if JSON parsing fails
        const positiveMatch = responseText.match(/"positive_takeaway":\s*"([^"]*)"/);
        const negativeMatch = responseText.match(/"negative_takeaway":\s*"([^"]*)"/);
        if (positiveMatch || negativeMatch) {
            console.warn("Falling back to regex extraction due to JSON parse error.");
             return {
                positive_takeaway: positiveMatch ? formatTakeaway(positiveMatch[1], 'positive') : null,
                negative_takeaway: negativeMatch ? formatTakeaway(negativeMatch[1], 'negative') : null,
             };
        }
        // If regex also fails, continue to retry or fail
        if (attempts > MAX_RETRIES) throw new Error("Failed to parse Gemini response after retries.");
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS / 2)); // Shorter delay for parse errors
      }

    } catch (error: any) {
      console.error(`Error calling Gemini API (Attempt ${attempts}):`, error);

      // Handle rate limit errors specifically
      if (error instanceof RateLimiterRes && error.msBeforeNext) {
          console.warn(`Rate limit hit. Waiting ${error.msBeforeNext}ms...`);
          await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
          continue; // Retry immediately after waiting
      }
      // Handle Gemini's own 429 error (though library might handle retries)
      if (error.status === 429 || (error.message && error.message.includes('429'))) {
          console.warn(`Received 429 from Gemini. Waiting ${RETRY_DELAY_MS * attempts}ms...`);
          if (attempts <= MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempts)); // Exponential backoff
              continue;
          }
      }
       // Handle blocked content safety errors
       if (error.message && error.message.includes('blocked due to safety settings')) {
            console.error('Gemini request blocked due to safety settings. Cannot generate takeaways for this content.');
            return { positive_takeaway: null, negative_takeaway: null }; // Return null, don't retry
       }


      // For other errors, retry with backoff or fail
      if (attempts > MAX_RETRIES) {
        console.error("Max retries reached for Gemini API call.");
        break; // Exit loop after max retries
      }
      console.log(`Waiting ${RETRY_DELAY_MS * attempts}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempts));
    }
  }

  // If all attempts fail
  return { positive_takeaway: null, negative_takeaway: null };
}

function formatTakeaway(takeaway: string | null, type: 'positive' | 'negative'): string | null {
    // Same formatTakeaway function from your previous code...
    if (!takeaway || takeaway === 'null' || takeaway.trim() === '') {
        return null;
    }
    let formatted = takeaway.replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
    const prefix = type === 'positive' ? '✓' : '⚠️';
    formatted = formatted
        .split('\n')
        .map(line => {
        line = line.trim();
        if (!line) return '';
        // Remove existing prefix if present, then add correct one
        line = line.replace(/^✓\s*/, '').replace(/^⚠️\s*/, '');
        return `${prefix} ${line}`;
        })
        .filter(Boolean)
        .join('\n');
    return formatted.trim() || null; // Return null if empty after formatting
}


// --- API Handler ---

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // --- Authentication (Example using Supabase edge function context - adapt if needed) ---
  // In a real app, you'd get the user session here, possibly using Supabase helpers
  // const { user } = await supabase.auth.api.getUserByCookie(req);
  // if (!user) {
  //   return res.status(401).json({ success: false, error: 'Authentication required' });
  // }
  // --- END Authentication ---

  const { reportId } = req.query;

  if (!reportId || typeof reportId !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing or invalid reportId' });
  }

  if (!GEMINI_API_KEY || !model) {
     return res.status(503).json({ success: false, error: 'AI Service unavailable (Configuration Error)' });
  }

  try {
    // 1. Get Accommodation Location
    const { data: accommodation, error: accomError } = await supabase
      .from('accommodations')
      .select('latitude, longitude, name, neighborhood, city_id') // Add name/neighborhood for context
      .eq('id', reportId)
      .single();

    if (accomError || !accommodation || !accommodation.latitude || !accommodation.longitude) {
      console.error('Accommodation fetch error:', accomError);
      return res.status(404).json({ success: false, error: `Accommodation not found for reportId: ${reportId}` });
    }

    const { latitude, longitude } = accommodation;
    const locationName = accommodation.name || accommodation.neighborhood || `location near [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`;
    const radiusMeters = 2000; // Define search radius (e.g., 2km) - make configurable?

    // 2. Check Cache
    const now = new Date().toISOString();
    const { data: cachedTakeaways, error: cacheError } = await supabase
      .from('community_takeaways')
      .select('positive_takeaway, negative_takeaway, created_at')
      .eq('latitude', latitude)
      .eq('longitude', longitude)
      .eq('radius', radiusMeters)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Use maybeSingle to handle no cache entry gracefully

    if (cacheError) {
      console.error('Cache check error:', cacheError);
      // Don't fail, proceed to generate, but log the error
    }

    if (cachedTakeaways) {
      console.log(`Cache hit for takeaways at [${latitude}, ${longitude}], radius ${radiusMeters}`);
      return res.status(200).json({
        success: true,
        takeaways: {
          positive_takeaway: cachedTakeaways.positive_takeaway,
          negative_takeaway: cachedTakeaways.negative_takeaway,
        },
        source: 'cache',
        cached_at: cachedTakeaways.created_at,
      });
    }

    console.log(`Cache miss for takeaways at [${latitude}, ${longitude}], radius ${radiusMeters}. Generating...`);

    // 3. Fetch Relevant Community Opinions (If Cache Miss)
    // Use PostGIS ST_DWithin for efficient geographic search
    const { data: opinions, error: opinionError } = await supabase
        .rpc('get_opinions_within_radius', {
            target_lat: latitude,
            target_lon: longitude,
            radius_meters: radiusMeters,
            opinion_limit: 100 // Limit number of opinions sent to AI
        });

    // Assumes you created a Supabase function like this:
    /*
    CREATE OR REPLACE FUNCTION get_opinions_within_radius(
        target_lat double precision,
        target_lon double precision,
        radius_meters integer,
        opinion_limit integer
    )
    RETURNS TABLE(body text, source_created_at timestamptz) AS $$
    BEGIN
        RETURN QUERY
        SELECT
            co.body,
            co.source_created_at
        FROM
            community_opinions co
        WHERE
            ST_DWithin(
                co.location, -- Ensure this is geography type
                ST_SetSRID(ST_MakePoint(target_lon, target_lat), 4326)::geography,
                radius_meters
            )
        ORDER BY
            co.source_created_at DESC NULLS LAST -- Prioritize newer opinions
        LIMIT opinion_limit;
    END;
    $$ LANGUAGE plpgsql;
    */


    if (opinionError) {
      console.error('Opinion fetch error:', opinionError);
      return res.status(500).json({ success: false, error: 'Failed to fetch community opinions' });
    }

    // 4. Generate Takeaways using Gemini (If Opinions Found)
    let generatedTakeaways: Takeaways = { positive_takeaway: null, negative_takeaway: null };
    let opinionCount = opinions?.length || 0;

    if (opinions && opinions.length > 0) {
       generatedTakeaways = await generateTakeawaysFromOpinions(opinions as CommunityOpinion[], locationName);
    } else {
        console.log(`No relevant opinions found within ${radiusMeters}m to generate takeaways.`);
        // You might still want to cache this 'null' result
    }


    // 5. Store Result (even nulls) in Cache
    const expiresAt = new Date();
    // Cache null results for a shorter time (e.g., 1 day) to allow quicker refresh if data appears
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
        generation_model: model?.model, // Store model name if available
        opinion_count: opinionCount,
      });

    if (insertError) {
      console.error('Failed to cache generated takeaways:', insertError);
      // Log error but still return the generated takeaways to the user
    } else {
        console.log(`Successfully cached takeaways for [${latitude}, ${longitude}], radius ${radiusMeters}`);
    }

    // 6. Return Generated Takeaways
    return res.status(200).json({
      success: true,
      takeaways: generatedTakeaways,
      source: 'generated',
      opinions_analyzed: opinionCount
    });

  } catch (error: any) {
    console.error('Unhandled error in community-takeaways handler:', error);
    return res.status(500).json({ success: false, error: 'Internal server error generating takeaways' });
  }
}