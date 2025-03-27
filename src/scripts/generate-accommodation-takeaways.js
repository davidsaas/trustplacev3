require('dotenv').config({ path: '.env.local' }); // Load environment variables
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Constants from safety-report/constants.ts
const EARTH_RADIUS = 6371; // km
const COORDINATE_LIMITS = {
  MAX_LATITUDE: 90,
  MAX_LONGITUDE: 180
};

// Functions from safety-report/utils.ts
const isValidCoordinates = (lat, lng) => {
  return !isNaN(lat) && 
         !isNaN(lng) && 
         lat !== 0 && 
         lng !== 0 && 
         Math.abs(lat) <= COORDINATE_LIMITS.MAX_LATITUDE && 
         Math.abs(lng) <= COORDINATE_LIMITS.MAX_LONGITUDE;
};

const calculateDistance = (point1, point2) => {
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return EARTH_RADIUS * c; // Distance in kilometers
};

const getRiskLevel = (score) => {
  if (score >= 8) return { 
    label: 'Low Risk',
    fill: '#10b981', // emerald-500
    description: 'Generally very safe area'
  };
  if (score >= 6) return { 
    label: 'Medium Risk',
    fill: '#f59e0b', // amber-500
    description: 'Exercise normal caution'
  };
  if (score >= 4) return { 
    label: 'High Risk',
    fill: '#f97316', // orange-500
    description: 'Exercise increased caution'
  };
  return { 
    label: 'Maximum Risk',
    fill: '#f43f5e', // rose-500
    description: 'Extreme caution advised'
  };
};

// --- Configuration ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const OPINION_RADIUS_METERS = 2000; // Radius to search for opinions around accommodation
const OPINION_LIMIT_FOR_PROMPT = 15; // Max opinions to include in the prompt
const SAFETY_METRIC_RADIUS_DEGREES = 0.01; // Approx 1.1km radius for metrics (adjust as needed)
const BATCH_SIZE = 50; // Number of takeaways to upsert at once
const TAKEAWAY_COUNT = 4; // Number of takeaways to request from AI

// Rate Limiter (adjust based on your Gemini plan - 14/min for free tier)
const limiter = new RateLimiterMemory({
  // Increase points based on your paid plan's RPM (e.g., 60 RPM)
  // Let's start with slightly less than 60 to be safe.
  points: 58, // Max requests
  duration: 60, // Per 60 seconds
});

// Delay between processing accommodations to help stay under limits
// Remove or significantly reduce the delay now that we have a higher limit.
// Setting to 0 removes the artificial delay. The rate limiter will handle pacing.
const DELAY_BETWEEN_ACCOMMODATIONS_MS = 0; // 0 seconds

// --- Initialization ---
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('Missing required environment variables (Supabase URL, Service Role Key, Gemini API Key).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash", // Or your preferred model
    // Optional: Configure safety settings if needed
    // safetySettings: [
    //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    //   { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    //   { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // ],
});

// --- Helper Functions ---

// Simplified version of findClosestSafetyMetrics for script use
async function findClosestSafetyMetricsForScript(location) {
  if (!location || !isValidCoordinates(location.lat, location.lng)) {
    return null;
  }

  const { data: metrics, error } = await supabase
    .from('safety_metrics')
    .select('metric_type, score, description, latitude, longitude')
    .gte('latitude', location.lat - SAFETY_METRIC_RADIUS_DEGREES)
    .lte('latitude', location.lat + SAFETY_METRIC_RADIUS_DEGREES)
    .gte('longitude', location.lng - SAFETY_METRIC_RADIUS_DEGREES)
    .lte('longitude', location.lng + SAFETY_METRIC_RADIUS_DEGREES);

  if (error) {
    console.error(`Error fetching safety metrics for [${location.lat}, ${location.lng}]:`, error.message);
    return null;
  }
  if (!metrics || metrics.length === 0) {
    return null;
  }

  const processedMetrics = metrics.map(metric => ({
    ...metric,
    latitude: typeof metric.latitude === 'string' ? parseFloat(metric.latitude) : metric.latitude,
    longitude: typeof metric.longitude === 'string' ? parseFloat(metric.longitude) : metric.longitude,
    score: typeof metric.score === 'string' ? parseFloat(metric.score) : metric.score
  }));

  const metricsByType = processedMetrics.reduce((acc, metric) => {
    if (!isValidCoordinates(metric.latitude, metric.longitude)) return acc;

    const distance = calculateDistance(location, { lat: metric.latitude, lng: metric.longitude });
    const existingMetric = acc[metric.metric_type];
    let existingDistance = Infinity;

    if (existingMetric && isValidCoordinates(existingMetric.latitude, existingMetric.longitude)) {
      existingDistance = calculateDistance(location, { lat: existingMetric.latitude, lng: existingMetric.longitude });
    }

    if (!existingMetric || distance < existingDistance) {
      acc[metric.metric_type] = metric;
    }
    return acc;
  }, {});

  return Object.values(metricsByType);
}

// Fetch opinions using RPC
async function fetchOpinionsForScript(location) {
    if (!location || !isValidCoordinates(location.lat, location.lng)) {
        return [];
    }

    const { data, error } = await supabase
        .rpc('get_opinions_within_radius', {
            target_lat: location.lat,
            target_lon: location.lng,
            radius_meters: OPINION_RADIUS_METERS,
            opinion_limit: OPINION_LIMIT_FOR_PROMPT
        });

    if (error) {
        console.error(`Error fetching opinions via RPC for [${location.lat}, ${location.lng}]:`, error.message);
        return [];
    }
    // Ensure the RPC returns the ID if we want to store opinion_ids_considered
    // If not, adjust the RPC or remove opinion_ids_considered from the table/logic
    return data || [];
}


// Format data and generate prompt
function createPrompt(accommodation, safetyMetrics, opinions) {
    let prompt = `Analyze the safety profile for the accommodation "${accommodation.name}" located near latitude ${accommodation.latitude}, longitude ${accommodation.longitude}.

Safety Metrics Summary (Scores 0-10, higher is better):`;

    if (safetyMetrics && safetyMetrics.length > 0) {
        safetyMetrics.forEach(metric => {
            const risk = getRiskLevel(metric.score); // Assuming score is 0-10
            prompt += `\n- ${metric.metric_type.charAt(0).toUpperCase() + metric.metric_type.slice(1)} Safety: Score ${metric.score}/10 (${risk.label}). ${metric.description}`;
        });
    } else {
        prompt += "\n- No specific safety metrics available for the immediate vicinity.";
    }

    prompt += "\n\nRecent Community Opinions Nearby:";
    if (opinions && opinions.length > 0) {
        opinions.forEach(opinion => {
            const timeAgo = opinion.source_created_at ? new Date(opinion.source_created_at).toLocaleDateString() : 'Unknown date'; // Simpler date for prompt
            prompt += `\n- "${opinion.body}" (Around ${timeAgo})`;
        });
    } else {
        prompt += "\n- No recent community opinions found nearby.";
    }

    prompt += `\n\nBased ONLY on the provided metrics and opinions, generate exactly ${TAKEAWAY_COUNT} concise safety takeaways (positive or negative points, max 1-2 sentences each) relevant for someone considering staying at this specific accommodation. Focus on actionable advice or key observations. Do not invent information. If data is insufficient for ${TAKEAWAY_COUNT} points, provide fewer.

Format the output ONLY as a numbered list:
1. [Takeaway 1]
2. [Takeaway 2]
...`;

    return prompt;
}

// Parse Gemini response
function parseTakeaways(responseText) {
    if (!responseText) return [];
    // Match lines starting with a number, period, and space
    const matches = responseText.match(/^\d+\.\s(.+)/gm);
    if (!matches) return [];
    // Extract the text after the number and space, trim whitespace
    return matches.map(line => line.replace(/^\d+\.\s/, '').trim()).filter(Boolean);
}

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Main Generation Logic ---
async function generateAllAccommodationTakeaways() {
    console.log('Starting generation of accommodation takeaways...');

    // 1. Fetch all accommodations with valid locations
    const { data: accommodations, error: accError } = await supabase
        .from('accommodations')
        .select('id, name, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
        // Add .limit(10) here for testing

    if (accError) {
        console.error('Failed to fetch accommodations:', accError.message);
        return;
    }
    if (!accommodations || accommodations.length === 0) {
        console.log('No accommodations found to process.');
        return;
    }

    console.log(`Found ${accommodations.length} accommodations to process.`);

    let takeawaysBatch = [];
    let processedCount = 0;
    const totalAccommodations = accommodations.length;

    for (const accommodation of accommodations) {
        processedCount++;
        const location = { lat: accommodation.latitude, lng: accommodation.longitude };
        console.log(`\nProcessing ${processedCount}/${totalAccommodations}: ${accommodation.name} (ID: ${accommodation.id})`);

        if (!isValidCoordinates(location.lat, location.lng)) {
            console.warn(`  Invalid coordinates for ${accommodation.name}. Skipping.`);
            continue;
        }

        try {
            // Apply rate limiting before API call
            await limiter.consume(accommodation.id); // Use accommodation ID as key
            console.log(`  Rate limit token consumed for ${accommodation.name}.`);

            // Fetch metrics and opinions
            const [safetyMetrics, opinions] = await Promise.all([
                findClosestSafetyMetricsForScript(location),
                fetchOpinionsForScript(location)
            ]);
            console.log(`  Fetched ${safetyMetrics?.length ?? 0} metric types and ${opinions?.length ?? 0} opinions.`);

            if (!safetyMetrics && !opinions?.length) {
                console.log(`  No metrics or opinions found for ${accommodation.name}. Skipping AI generation.`);
                continue; // Optionally, you could store an empty takeaway array here
            }

            // Create prompt and call Gemini
            const prompt = createPrompt(accommodation, safetyMetrics, opinions);
            console.log(`  Generating takeaways with Gemini...`);
            const result = await model.generateContent(prompt);
            const response = result.response;
            const responseText = response.text();

            const generatedTakeaways = parseTakeaways(responseText);
            console.log(`  Generated ${generatedTakeaways.length} takeaways.`);

            if (generatedTakeaways.length > 0) {
                takeawaysBatch.push({
                    accommodation_id: accommodation.id,
                    takeaways: generatedTakeaways,
                    generation_model: model.model, // Store model name
                    // Optional: Add metrics_considered and opinion_ids_considered if needed
                    // metrics_considered: safetyMetrics ? safetyMetrics.map(m => ({ type: m.metric_type, score: m.score })) : null,
                    // opinion_ids_considered: opinions ? opinions.map(o => o.id) : null, // Requires RPC to return ID
                });
            } else {
                console.warn(`  Could not parse takeaways from response for ${accommodation.name}.`);
                // Optionally store empty array or log error details
                // console.log("Raw Gemini Response:", responseText);
            }

            // Upsert batch if full or if it's the last accommodation
            if (takeawaysBatch.length >= BATCH_SIZE || processedCount === totalAccommodations) {
                if (takeawaysBatch.length > 0) {
                    console.log(`  Upserting batch of ${takeawaysBatch.length} takeaways...`);
                    const { error: upsertError } = await supabase
                        .from('accommodation_takeaways')
                        .upsert(takeawaysBatch, { onConflict: 'accommodation_id' }); // Upsert based on accommodation_id

                    if (upsertError) {
                        console.error('  Error upserting batch:', upsertError.message);
                        // Handle error - maybe retry later or log failed IDs
                    } else {
                        console.log(`  Successfully upserted batch.`);
                    }
                    takeawaysBatch = []; // Clear the batch
                }
            }

            // Add delay before processing the next accommodation
            // This delay is now 0ms based on the constant change above.
            if (processedCount < totalAccommodations && DELAY_BETWEEN_ACCOMMODATIONS_MS > 0) {
                console.log(`  Waiting ${DELAY_BETWEEN_ACCOMMODATIONS_MS / 1000}s before next accommodation...`);
                await delay(DELAY_BETWEEN_ACCOMMODATIONS_MS);
            }

        } catch (error) {
            if (error?.response?.status === 429) {
                console.warn(`  Rate limit likely hit for ${accommodation.name}. Check your Gemini plan limits and adjust 'points' in the script if needed. Error: ${error.message}`);
                // Implement more robust backoff/retry logic if needed
                // Increase wait time significantly if rate limit is hit unexpectedly
                await delay(5000); // Wait 5 seconds before retrying
            } else {
                console.error(`  Error processing ${accommodation.name}:`, error.message);
                // Log error details if available: console.error(error);
            }
            // Continue to the next accommodation even if one fails
        }
    }

    console.log('\nFinished generating accommodation takeaways.');
}

// Run the generation function
generateAllAccommodationTakeaways(); 