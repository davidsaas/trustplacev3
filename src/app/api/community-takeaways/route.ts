import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

// Initialize Supabase client (use environment variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Initialize Google Generative AI (use environment variable)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });
} else {
  console.error("Missing GEMINI_API_KEY environment variable. AI Takeaways will not function.");
}

// Rate Limiting
const rateLimiter = new RateLimiterMemory({
  points: 50,
  duration: 60,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

interface Takeaways {
  positive_takeaway: string | null;
  negative_takeaway: string | null;
}

interface CommunityOpinion {
  body: string;
  source_created_at?: string;
}

// Core Generation Logic
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

  const MAX_INPUT_LENGTH = 30000;
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
      await rateLimiter.consume('gemini_api');

      console.log(`Calling Gemini API (Attempt ${attempts})...`);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      try {
        const parsed = JSON.parse(responseText);
        return {
          positive_takeaway: formatTakeaway(parsed.positive_takeaway, 'positive'),
          negative_takeaway: formatTakeaway(parsed.negative_takeaway, 'negative'),
        };
      } catch (parseError) {
        console.error(`Error parsing Gemini JSON (Attempt ${attempts}):`, parseError, 'Response Text:', responseText);
        const positiveMatch = responseText.match(/"positive_takeaway":\s*"([^"]*)"/);
        const negativeMatch = responseText.match(/"negative_takeaway":\s*"([^"]*)"/);
        if (positiveMatch || negativeMatch) {
          console.warn("Falling back to regex extraction due to JSON parse error.");
          return {
            positive_takeaway: positiveMatch ? formatTakeaway(positiveMatch[1], 'positive') : null,
            negative_takeaway: negativeMatch ? formatTakeaway(negativeMatch[1], 'negative') : null,
          };
        }
        if (attempts > MAX_RETRIES) throw new Error("Failed to parse Gemini response after retries.");
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS / 2));
      }

    } catch (error: any) {
      console.error(`Error calling Gemini API (Attempt ${attempts}):`, error);

      if (error instanceof RateLimiterRes && error.msBeforeNext) {
        console.warn(`Rate limit hit. Waiting ${error.msBeforeNext}ms...`);
        await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
        continue;
      }

      if (error.status === 429 || (error.message && error.message.includes('429'))) {
        console.warn(`Received 429 from Gemini. Waiting ${RETRY_DELAY_MS * attempts}ms...`);
        if (attempts <= MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempts));
          continue;
        }
      }

      if (error.message && error.message.includes('blocked due to safety settings')) {
        console.error('Gemini request blocked due to safety settings. Cannot generate takeaways for this content.');
        return { positive_takeaway: null, negative_takeaway: null };
      }

      if (attempts > MAX_RETRIES) {
        console.error("Max retries reached for Gemini API call.");
        break;
      }
      console.log(`Waiting ${RETRY_DELAY_MS * attempts}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempts));
    }
  }

  return { positive_takeaway: null, negative_takeaway: null };
}

function formatTakeaway(takeaway: string | null, type: 'positive' | 'negative'): string | null {
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
      line = line.replace(/^✓\s*/, '').replace(/^⚠️\s*/, '');
      return `${prefix} ${line}`;
    })
    .filter(Boolean)
    .join('\n');
  return formatted.trim() || null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get('reportId');

  if (!reportId) {
    return NextResponse.json({ success: false, error: 'Missing reportId' }, { status: 400 });
  }

  if (!GEMINI_API_KEY || !model) {
    return NextResponse.json({ success: false, error: 'AI Service unavailable (Configuration Error)' }, { status: 503 });
  }

  try {
    const { data: accommodation, error: accomError } = await supabase
      .from('accommodations')
      .select('latitude, longitude, name, neighborhood, city_id')
      .eq('id', reportId)
      .single();

    if (accomError || !accommodation || !accommodation.latitude || !accommodation.longitude) {
      console.error('Accommodation fetch error:', accomError);
      return NextResponse.json({ success: false, error: `Accommodation not found for reportId: ${reportId}` }, { status: 404 });
    }

    const { latitude, longitude } = accommodation;
    const locationName = accommodation.name || accommodation.neighborhood || `location near [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`;
    const radiusMeters = 2000;

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
      .maybeSingle();

    if (cacheError) {
      console.error('Cache check error:', cacheError);
    }

    if (cachedTakeaways) {
      console.log(`Cache hit for takeaways at [${latitude}, ${longitude}], radius ${radiusMeters}`);
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

    console.log(`Cache miss for takeaways at [${latitude}, ${longitude}], radius ${radiusMeters}. Generating...`);

    const { data: opinions, error: opinionError } = await supabase
      .rpc('get_opinions_within_radius', {
        target_lat: latitude,
        target_lon: longitude,
        radius_meters: radiusMeters,
        opinion_limit: 100
      });

    if (opinionError) {
      console.error('Opinion fetch error:', opinionError);
      return NextResponse.json({ success: false, error: 'Failed to fetch community opinions' }, { status: 500 });
    }

    let generatedTakeaways: Takeaways = { positive_takeaway: null, negative_takeaway: null };
    let opinionCount = opinions?.length || 0;

    if (opinions && opinions.length > 0) {
      generatedTakeaways = await generateTakeawaysFromOpinions(opinions as CommunityOpinion[], locationName);
    } else {
      console.log(`No relevant opinions found within ${radiusMeters}m to generate takeaways.`);
    }

    const expiresAt = new Date();
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
        generation_model: model?.model,
        opinion_count: opinionCount,
      });

    if (insertError) {
      console.error('Failed to cache generated takeaways:', insertError);
    } else {
      console.log(`Successfully cached takeaways for [${latitude}, ${longitude}], radius ${radiusMeters}`);
    }

    return NextResponse.json({
      success: true,
      takeaways: generatedTakeaways,
      source: 'generated',
      opinions_analyzed: opinionCount
    });

  } catch (error: any) {
    console.error('Unhandled error in community-takeaways handler:', error);
    return NextResponse.json({ success: false, error: 'Internal server error generating takeaways' }, { status: 500 });
  }
} 