// src/scripts/ingest-reddit-opinions.ts
const { createClient } = require('@supabase/supabase-js');
const nodeFetch = require('node-fetch');
const dotenv = require('dotenv');
const nlp = require('compromise');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '.env' });

// --- Types ---
interface MapboxContext {
    id: string;
    text: string;
    wikidata?: string;
    short_code?: string;
}
interface MapboxFeature {
    center: [number, number]; // [longitude, latitude]
    place_name: string;
    context?: MapboxContext[];
    properties?: {
        wikidata?: string;
    };
    id?: string;
    text?: string; // Primary text for the feature itself
}
interface MapboxResponse {
  features: MapboxFeature[];
}
interface RedditItem {
    id?: string;
    parsedId?: string;
    title?: string;
    body?: string;
    url?: string;
    link?: string;
    username?: string;
    userId?: string;
    communityName?: string;
    parsedCommunityName?: string;
    upVotes?: number;
    createdAt?: string;
    scrapedAt?: string;
}

// --- Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apifyDatasetUrl = process.env.APIFY_REDDIT_DATASET_URL;
const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// --- Constants ---
const DEFAULT_LA_CITY_ID = 1; // <<< VERIFY THIS ID!
const LA_BBOX = "-118.9500,33.7000,-117.6500,34.8200";
const LA_PROXIMITY = "-118.2437,34.0522";

const ACCEPTABLE_LA_CONTEXT_PLACES_LOWER = [
    'los angeles', 'santa monica', 'west hollywood', 'beverly hills',
    'culver city', 'venice', 'long beach', 'redondo beach', 'manhattan beach',
    'pasadena', 'burbank', 'glendale', 'inglewood', 'compton', 'torrance',
     'hollywood', 'downtown', 'chinatown', 'koreatown', 'echo park', 'silver lake',
     'highland park', 'arts district', 'little tokyo', 'hancock park', 'larchmont village',
     'century city', 'westwood', 'brentwood', 'mar vista', 'playa del rey', 'westchester'
].map(p => p.toLowerCase());

// --- Initialization & Validation ---
if (!supabaseUrl || !supabaseServiceKey || !apifyDatasetUrl || !mapboxAccessToken) {
  console.error('🛑 Missing one or more environment variables. Check .env file.'); process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Config Loading Function ---
function loadCityConfig(cityId: number): any | null {
    const configFilePath = path.join(__dirname, `../../config/cities/${cityId}.json`);
    console.log(`Attempting to load config from: ${configFilePath}`);
    try {
        if (fs.existsSync(configFilePath)) {
            const rawData = fs.readFileSync(configFilePath, 'utf-8');
            const configData = JSON.parse(rawData);
            console.log(`Successfully loaded config for City ID: ${cityId} (${configData.city_name})`);
            // TODO: Add schema validation for the config object
            return configData;
        } else {
            console.error(`🛑 Error: Config file not found for City ID ${cityId} at ${configFilePath}`);
            return null;
        }
    } catch (error: any) {
        console.error(`🛑 Error loading or parsing config for City ID ${cityId}:`, error.message || error);
        return null;
    }
}

// --- Geocoding Function (using the refined filtering logic from your run) ---
async function geocodeRedditItem(item: RedditItem, targetCityId: number): Promise<{ latitude: number; longitude: number; cityId: number | null } | null> {
    if (!mapboxAccessToken) return null;
    const textToAnalyze = `${item.title || ''}. ${item.body || ''}`;
    if (!textToAnalyze.trim()) return null;
    const doc = nlp(textToAnalyze);

    let locationQuery = '';
    const properNounPlace = doc.match('#ProperNoun+ (as #Place|#Organization|#Address)').first().text('trim');
    const neighborhood = doc.match('#Neighborhood+').first().text('trim');
    if (properNounPlace) locationQuery = properNounPlace;
    else if (neighborhood) locationQuery = neighborhood;
    else { /* ... Fallback logic ... */
        const place = doc.match('#Place+').not('#Country').not('(los angeles|la|boulevard|blvd|avenue|ave|street|st|road|rd|way|dr|drive)').first().text('trim');
        const city = doc.match('#City+').not('(los angeles|la)').first().text('trim');
        if (place) locationQuery = place;
        else if (city) locationQuery = city;
        else if (doc.has('downtown')) locationQuery = 'Downtown Los Angeles';
        else if (doc.has('chinatown')) locationQuery = 'Chinatown Los Angeles';
        else if (doc.has('(weho|west hollywood)')) locationQuery = 'West Hollywood';
        else { let simplePlace = doc.match('#Place').not('(boulevard|blvd|avenue|ave|street|st|road|rd|way|dr|drive)').first().text('trim'); if(simplePlace) locationQuery = simplePlace; }
    }
    locationQuery = locationQuery.replace(/'s$/, '').replace(/^[.,!?;:]+|[.,!?;:]+$/, '').trim();
    if (!locationQuery || locationQuery.length < 3) return null;

    let mapboxQuery = locationQuery;
    if (!/\d/.test(locationQuery) && !ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.some(p => locationQuery.toLowerCase().includes(p)) && !locationQuery.toLowerCase().includes(' ca') && !locationQuery.toLowerCase().includes('california')) {
         const broadLAContext = ['los angeles', 'santa monica', 'west hollywood', 'beverly hills', 'culver city', 'venice', 'long beach', 'pasadena', 'burbank', 'glendale', 'county'];
         if (!broadLAContext.some(p => locationQuery.toLowerCase().includes(p))) {
            mapboxQuery = `${locationQuery}, Los Angeles, CA`;
         }
    }
    // console.log(`📍 NLP -> Mapbox query: "${mapboxQuery}"`);

    const encodedQuery = encodeURIComponent(mapboxQuery);
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${mapboxAccessToken}&limit=1&bbox=${LA_BBOX}&proximity=${LA_PROXIMITY}&types=neighborhood,locality,place,poi,address`;

    try {
        const geoResponse = await nodeFetch(geocodeUrl);
        if (!geoResponse.ok) { console.error(`🗺️ Mapbox API error for "${mapboxQuery}": ${geoResponse.status}`); return null; }
        const geoData = await geoResponse.json() as MapboxResponse;

        if (geoData.features && geoData.features.length > 0) {
            const bestMatch = geoData.features[0];
            const [longitude, latitude] = bestMatch.center;
            if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

            // --- Context Filtering Logic (from your working run) ---
            let isInAcceptableContext = false;
            let foundRegionCA = false;
            if (bestMatch.context) {
                for (const context of bestMatch.context) {
                    const contextTextLower = context.text.toLowerCase();
                    const contextIdPrefix = context.id.split('.')[0];
                    if (contextIdPrefix === 'place' || contextIdPrefix === 'locality') { if (ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.includes(contextTextLower)) { isInAcceptableContext = true; } }
                    if (contextIdPrefix === 'district' && contextTextLower.includes('los angeles county')) { isInAcceptableContext = true; } // Consider county as acceptable place context
                    if (contextIdPrefix === 'region' && contextTextLower.includes('california')) { foundRegionCA = true; }
                }
            }
            if (!isInAcceptableContext || !foundRegionCA) { // Check place_name as fallback
                 if (bestMatch.place_name) {
                     const placeNameLower = bestMatch.place_name.toLowerCase();
                     if (ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.some(place => placeNameLower.includes(place)) && placeNameLower.includes('california')) { isInAcceptableContext = true; foundRegionCA = true; }
                     else if (placeNameLower.includes('los angeles county') && placeNameLower.includes('california')) { isInAcceptableContext = true; foundRegionCA = true; }
                 }
            }
            if (!isInAcceptableContext || !foundRegionCA) {
                // console.warn(`🗺️ Geocoding result for "${mapboxQuery}" REJECTED: Context not valid LA region (${bestMatch.place_name || 'No Place Name'})`); // Less verbose
                return null;
            }
            // --- End Context Filtering ---

            // console.log(`✅ Geocoded "${mapboxQuery}" -> [${latitude.toFixed(5)}, ${longitude.toFixed(5)}]`); // Less verbose
            return { latitude, longitude, cityId: targetCityId };
        } else { return null; }
    } catch (error: any) { console.error(`💥 Error during Mapbox API call for "${mapboxQuery}":`, error.message || error); return null; }
}

// --- Main Ingestion Logic ---
async function ingestData(targetCityId: number) {
  console.log(`🚀 Starting Reddit opinion ingestion for City ID: ${targetCityId}...`);

  // Load city configuration based on targetCityId
  const cityConfig = loadCityConfig(targetCityId);
  if (!cityConfig) {
    console.error(`🛑 Could not load configuration for City ID: ${targetCityId}. Exiting.`);
    process.exit(1);
  }
  const cityName = cityConfig.city_name || `City ${targetCityId}`;

  // Determine the Apify URL to use
  let cityApifyUrl: string | undefined;
  if (cityConfig.apify?.redditDatasetUrlEnvVar) {
      cityApifyUrl = process.env[cityConfig.apify.redditDatasetUrlEnvVar];
      if (!cityApifyUrl) {
          console.error(`🛑 Environment variable ${cityConfig.apify.redditDatasetUrlEnvVar} specified in config but not found.`);
          process.exit(1);
      }
  } else if (cityConfig.apify?.redditDatasetUrl) {
      cityApifyUrl = cityConfig.apify.redditDatasetUrl;
  } else {
      console.error(`🛑 Missing 'apify.redditDatasetUrl' or 'apify.redditDatasetUrlEnvVar' in config for City ID ${targetCityId}.`);
      process.exit(1);
  }

  // Explicit check to satisfy TypeScript after potentially exiting
  if (!cityApifyUrl) {
      console.error("🛑 Internal error: cityApifyUrl is unexpectedly undefined.");
      process.exit(1);
  }

  // Check for placeholder URL (basic check)
  if (cityApifyUrl.includes('?????')) {
      console.warn(`🟡 Warning: Apify URL for ${cityName} seems to be a placeholder. Please update the config file.`);
      // Optionally exit if placeholder is not allowed: process.exit(1);
  }
  
  console.log(`Fetching data for ${cityName} from Apify: ${cityApifyUrl}`);
  try {
    const response = await nodeFetch(cityApifyUrl);
    if (!response.ok) throw new Error(`Apify fetch failed: ${response.status} ${response.statusText}`);
    const rawData = await response.json();
    const data = Array.isArray(rawData) ? rawData as RedditItem[] : [];
    console.log(`✅ Fetched ${data.length} items.`);
    if (data.length === 0) { console.log('🟡 No data.'); return; }

    const opinionsToInsert = [];
    let geocodeSuccessCount = 0; let geocodeFailCount = 0; let processedItemCount = 0; const totalItems = data.length;
    console.log('Processing items sequentially for geocoding...');

    for (const item of data) {
        processedItemCount++;
        if (processedItemCount % 50 === 0) console.log(`   Processed ${processedItemCount}/${totalItems} for City ID: ${targetCityId}...`);
        if (!item.body || !(item.id || item.parsedId)) { geocodeFailCount++; continue; }

        const geo = await geocodeRedditItem(item, targetCityId);

        if (geo) {
            geocodeSuccessCount++;
            opinionsToInsert.push({
                external_id: item.id || item.parsedId,
                source: 'reddit',
                url: item.url || item.link,
                title: item.title,
                body: item.body,
                username: item.username,
                user_id_external: item.userId,
                community_name: item.communityName || item.parsedCommunityName,
                upvotes: item.upVotes,
                raw_data: item,
                latitude: geo.latitude,
                longitude: geo.longitude,
                // *** THIS IS THE KEY ADDITION ***
                location: `POINT(${geo.longitude} ${geo.latitude})`, // Create PostGIS POINT string
                // *** END ADDITION ***
                city_id: geo.cityId,
                source_created_at: item.createdAt ? new Date(item.createdAt).toISOString() : null,
                source_scraped_at: item.scrapedAt ? new Date(item.scrapedAt).toISOString() : null,
            });
        } else {
            geocodeFailCount++;
        }
        // Optional delay: await new Promise(resolve => setTimeout(resolve, 60));
    }

    console.log('---');
    console.log(`Geocoding Summary: ${geocodeSuccessCount} succeeded, ${geocodeFailCount} failed/skipped.`);
    console.log(`💾 Prepared ${opinionsToInsert.length} opinions for DB.`);
    if (opinionsToInsert.length === 0) { console.log('🟡 No valid opinions to insert.'); return; }

    // Batch insert/upsert
    const BATCH_SIZE = 100; let totalDbProcessed = 0; let failedBatchCount = 0;
    console.log(`🚚 Inserting data in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < opinionsToInsert.length; i += BATCH_SIZE) {
        const batch = opinionsToInsert.slice(i, i + BATCH_SIZE); const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        // Ensure the 'location' column in your Supabase table is of type 'geography(Point, 4326)'
        const { error } = await supabase.from('community_opinions').upsert(batch, { onConflict: 'external_id' });
        if (error) {
            console.error(`❌ DB Error (Batch ${batchNum}):`, error.message);
            if(batch.length > 0) console.error(`   First item ID: ${batch[0].external_id}`);
            failedBatchCount++;
        } else {
            totalDbProcessed += batch.length;
            console.log(`  -> Batch ${batchNum} processed.`);
        }
    }
    console.log('---');
    console.log(`✅ Ingestion finished for ${cityName} (ID: ${targetCityId}). DB Processed: ${totalDbProcessed}.`);
    if (failedBatchCount > 0) console.log(`   Warning: ${failedBatchCount} batches had DB errors.`);

  } catch (error: any) { 
      console.error(`❌ Unhandled error during ingestion for ${cityName} (ID: ${targetCityId}):`, error.message || error); 
      process.exit(1); 
  }
}

// --- Argument Parsing and Execution ---
function parseArgs() {
  const args = process.argv.slice(2);
  let cityId: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--city-id' && i + 1 < args.length) {
      const id = parseInt(args[i + 1], 10);
      if (!isNaN(id)) {
        cityId = id;
        break;
      }
    }
  }
  return cityId;
}

const targetCityId = parseArgs();

if (targetCityId === null) {
  console.error('🛑 Error: Missing required argument --city-id');
  console.log('Usage: node dist/scripts/ingest-reddit-opinions.js --city-id <number>'); // Adjust path if needed
  process.exit(1);
}

ingestData(targetCityId);