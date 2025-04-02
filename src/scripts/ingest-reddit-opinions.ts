import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import nlp from 'compromise';
import fs from 'fs';
const path = require('path');
const { parseArgs } = require('node:util'); // Use built-in arg parser

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

// --- Configuration (Minimal: only non-city-specific needed) ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// --- Initialization & Validation ---
if (!supabaseUrl || !supabaseServiceKey || !mapboxAccessToken) {
  console.error('🛑 Missing required environment variables (Supabase/Mapbox). Check .env file.'); process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Argument Parsing ---
let cityId: number | null = null;
let cityConfig: any; // Declare cityConfig here

try {
  const args = parseArgs({
    options: {
      'city-id': { type: 'string' },
    },
    allowPositionals: true,
  });
  if (args.values['city-id']) {
    cityId = parseInt(args.values['city-id'], 10);
    if (isNaN(cityId)) {
      throw new Error("Invalid --city-id provided. Must be a number.");
    }
  } else {
    throw new Error("--city-id argument is required.");
  }
  console.log(`Processing opinions for City ID: ${cityId}`);

  // --- Load City Configuration ---
  const configPath = path.resolve(__dirname, `../config/cities/${cityId}.json`);
  console.log(`Loading city config from: ${configPath}`);
  const configFile = fs.readFileSync(configPath, 'utf-8');
  cityConfig = JSON.parse(configFile);

  // Validate required config fields for this script
  if (!cityConfig.city_name) throw new Error("Missing city_name in config.");
  if (!cityConfig.apify_urls || !cityConfig.apify_urls.reddit_opinions_url) throw new Error("Missing apify_urls.reddit_opinions_url in config.");
  if (!cityConfig.mapbox_config || !cityConfig.mapbox_config.bbox || !cityConfig.mapbox_config.proximity) throw new Error("Missing mapbox_config (bbox, proximity) in config.");
  if (!cityConfig.context_places || !Array.isArray(cityConfig.context_places)) throw new Error("Missing or invalid context_places array in config.");

  console.log(`Loaded config for ${cityConfig.city_name}`);

} catch (err: any) {
  console.error("Initialization error:", err.message);
  process.exit(1);
}

// --- Geocoding Function (uses cityConfig) ---
async function geocodeRedditItem(item: RedditItem, currentCityConfig: any): Promise<{ latitude: number; longitude: number; cityId: number | null } | null> {
    if (!mapboxAccessToken) return null;
    const textToAnalyze = `${item.title || ''}. ${item.body || ''}`;
    if (!textToAnalyze.trim()) return null;

    const targetCityId = currentCityConfig.city_id;
    const cityBbox = currentCityConfig.mapbox_config.bbox;
    const cityProximity = currentCityConfig.mapbox_config.proximity;
    // Ensure context places are lowercase for comparison
    const cityContextPlacesLower = (currentCityConfig.context_places as string[]).map(p => p.toLowerCase());
    const primaryCityNameLower = currentCityConfig.city_name.toLowerCase(); // e.g., "los angeles"

    const doc = nlp(textToAnalyze);

    // --- NLP Location Extraction (largely unchanged, but remove LA specifics) ---
    let locationQuery = '';
    const properNounPlace = doc.match('#ProperNoun+ (as #Place|#Organization|#Address)').first().text('trim');
    const neighborhood = doc.match('#Neighborhood+').first().text('trim');
    if (properNounPlace) locationQuery = properNounPlace;
    else if (neighborhood) locationQuery = neighborhood;
    else { // Simplified fallback
        const place = doc.match('#Place+').not('#Country').not('(boulevard|blvd|avenue|ave|street|st|road|rd|way|dr|drive)').first().text('trim');
        const city = doc.match('#City+').not(primaryCityNameLower).first().text('trim'); // Avoid matching the city itself if possible
        if (place) locationQuery = place;
        else if (city) locationQuery = city;
        // Remove specific city mentions like 'downtown', 'chinatown' unless qualified
        // This part becomes trickier without hardcoding - might need refinement
        else { let simplePlace = doc.match('#Place').not('(boulevard|blvd|avenue|ave|street|st|road|rd|way|dr|drive)').first().text('trim'); if(simplePlace) locationQuery = simplePlace; }
    }
    locationQuery = locationQuery.replace(/'s$/, '').replace(/^[.,!?;:]+|[.,!?;:]+$/, '').trim();
    if (!locationQuery || locationQuery.length < 3) return null;

    let mapboxQuery = locationQuery;
    // --- City Context Appending Logic (Generalized) ---
    const locationQueryLower = locationQuery.toLowerCase();
    const countryIndicators = [' usa', ' u.s.a', ' united states']; // Add more if needed
    const stateIndicators = [' ca', 'california', ' ny', 'new york', ' fl', 'florida']; // Add relevant states

    // Check if the query *already* contains a relevant city/context place or state/country indicator
    const hasSufficientContext = cityContextPlacesLower.some(p => locationQueryLower.includes(p)) ||
                                 stateIndicators.some(s => locationQueryLower.includes(s)) ||
                                 countryIndicators.some(c => locationQueryLower.includes(c)) ||
                                 /\d/.test(locationQuery); // Addresses usually have numbers

    if (!hasSufficientContext) {
        // If no context, append the primary city name from config
        mapboxQuery = `${locationQuery}, ${currentCityConfig.city_name}`; // e.g., "Union Station, Los Angeles"
        console.log(`Appended city context: Query became "${mapboxQuery}"`);
    }
    // console.log(`📍 NLP -> Mapbox query: "${mapboxQuery}"`);

    const encodedQuery = encodeURIComponent(mapboxQuery);
    // Use bbox and proximity from config
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${mapboxAccessToken}&limit=1&bbox=${cityBbox}&proximity=${cityProximity}&types=neighborhood,locality,place,poi,address`;
    try {
        const response = await fetch(geocodeUrl);
        if (!response.ok) {
            console.error(`🗺️ Mapbox API error for "${mapboxQuery}": ${response.status}`);
            return null;
        }

        let geoData: MapboxResponse;
        try {
            geoData = await response.json();
        } catch (error) {
            console.error(`🗺️ Failed to parse Mapbox response for "${mapboxQuery}": ${error}`);
            return null;
        }

        if (Array.isArray(geoData.features) && geoData.features.length > 0) {
            const bestMatch = geoData.features[0];
            const [longitude, latitude] = bestMatch.center;
            if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

            // --- Context Filtering Logic (Uses cityConfig.context_places) ---
            let isInAcceptableContext = false;
            let foundCorrectRegion = false; // E.g., found 'California' for LA, 'New York' for NYC
            const expectedRegionLower = (currentCityConfig.mapbox_config.region || '').toLowerCase(); // Get expected region (e.g., 'california') from config if available

            if (bestMatch.context) {
                for (const context of bestMatch.context) {
                    const contextTextLower = context.text.toLowerCase();
                    const contextIdPrefix = context.id.split('.')[0];

                    // Check if context matches *any* acceptable place for the city
                    if (contextIdPrefix === 'place' || contextIdPrefix === 'locality' || contextIdPrefix === 'neighborhood') {
                        if (cityContextPlacesLower.includes(contextTextLower)) {
                            isInAcceptableContext = true;
                        }
                    }
                    // Check for county match (optional, based on naming convention)
                    if (contextIdPrefix === 'district' && contextTextLower.includes(primaryCityNameLower+" county")) {
                         isInAcceptableContext = true;
                     }
                    // Check for region match (e.g., state)
                    if (expectedRegionLower && contextIdPrefix === 'region' && contextTextLower.includes(expectedRegionLower)) {
                        foundCorrectRegion = true;
                    }
                }
            }
            // Fallback: Check the main place_name string
            if (!isInAcceptableContext && bestMatch.place_name) {
                const placeNameLower = bestMatch.place_name.toLowerCase();
                if (cityContextPlacesLower.some(place => placeNameLower.includes(place))) {
                    isInAcceptableContext = true;
                }
            }
            if (!foundCorrectRegion && bestMatch.place_name && expectedRegionLower) {
                 const placeNameLower = bestMatch.place_name.toLowerCase();
                 if (placeNameLower.includes(expectedRegionLower)) {
                      foundCorrectRegion = true;
                 }
            }

            // Final Decision: Must be in acceptable context AND in the correct region (if region check is configured)
            const isValidLocation = isInAcceptableContext && (!expectedRegionLower || foundCorrectRegion);

            if (!isValidLocation) {
                 console.warn(`🗺️ Geocoding result for "${mapboxQuery}" REJECTED: Context/Region not valid for ${currentCityConfig.city_name} (${bestMatch.place_name || 'No Place Name'})`);
                return null;
            }
            // --- End Context Filtering ---

            console.log(`✅ Geocoded "${mapboxQuery}" for ${currentCityConfig.city_name} -> [${latitude.toFixed(5)}, ${longitude.toFixed(5)}]`);
            return { latitude, longitude, cityId: targetCityId };
        } else { return null; }
    } catch (error: any) { console.error(`💥 Error during Mapbox API call for "${mapboxQuery}":`, error.message || error); return null; }
}

// --- Main Ingestion Logic (uses cityConfig) ---
async function ingestData(currentCityConfig: any) { // Accept config object
  const targetCityId = currentCityConfig.city_id;
  console.log(`🚀 Starting Reddit opinion ingestion for City ID: ${targetCityId} (${currentCityConfig.city_name})...`);

  // Get Apify URL from config
  const cityApifyUrl = currentCityConfig.apify_urls.reddit_opinions_url;

  // Check for placeholder URL (basic check)
  if (!cityApifyUrl || cityApifyUrl.includes('?????')) {
      console.warn(`🟡 Warning: Apify Reddit URL for ${currentCityConfig.city_name} seems missing or is a placeholder. Skipping ingestion. Please update the config file.`);
      return; // Skip this city if URL is missing/placeholder
  }

  console.log(`Fetching data for ${currentCityConfig.city_name} from Apify: ${cityApifyUrl}`);
  try {
    const response = nodeFetch(cityApifyUrl) as unknown as Response;
    if (!response?.ok) throw new Error(`Apify fetch failed: ${response?.status} ${response?.statusText}`);
    const rawData = await response?.json() as unknown;
    const data = Array.isArray(rawData) ? rawData as RedditItem[] : [];
    console.log(`✅ Fetched ${data.length} items for ${currentCityConfig.city_name}.`);
    if (!data.length) {
      console.log('🟡 No data to process.');
      return;
    }

    const opinionsToInsert = [];
    let geocodeSuccessCount = 0; let geocodeFailCount = 0; let processedItemCount = 0; const totalItems = data.length;
    console.log(`Processing items sequentially for geocoding for ${currentCityConfig.city_name}...`);

    for (const item of data) {
        processedItemCount++;
        if (processedItemCount % 50 === 0) console.log(`   Processed ${processedItemCount}/${totalItems} for ${currentCityConfig.city_name}...`);

        // --- Add check for missing ID ---
        const externalId = item.id || item.parsedId;
        if (!externalId) {
            console.warn(`   Skipping item: Missing both id and parsedId.`);
            geocodeFailCount++; // Count as a failed/skipped item
            continue;
        }
        // --- End check for missing ID ---

        // Original check for body
        if (!item.body) {
            geocodeFailCount++;
            continue;
        }

        const geo = await geocodeRedditItem(item, currentCityConfig);

        if (geo) {
            geocodeSuccessCount++;
            opinionsToInsert.push({
                external_id: externalId, // Use the verified externalId
                source: 'reddit',
                url: item.url || item.link,
                title: item.title,
                body: item.body,
                username: item.username,
                user_id_external: item.userId,
                community_name: item.communityName || item.parsedCommunityName,
                upvotes: item.upVotes,
                raw_data: item, // Store original item
                latitude: geo.latitude,
                longitude: geo.longitude,
                location: `POINT(${geo.longitude} ${geo.latitude})`, // PostGIS POINT string
                city_id: geo.cityId,
                source_created_at: item.createdAt ? new Date(item.createdAt).toISOString() : null,
                source_scraped_at: item.scrapedAt ? new Date(item.scrapedAt).toISOString() : null,
            });
        } else {
            // Geocoding failed or skipped
            geocodeFailCount++;
        }
    }
    // Revert final logging
    console.log(`🏁 Geocoding finished for ${currentCityConfig.city_name}: Success: ${geocodeSuccessCount}, Failed/Skipped: ${geocodeFailCount}`);

    if (opinionsToInsert.length > 0) {
        console.log(`Inserting ${opinionsToInsert.length} opinions into Supabase for ${currentCityConfig.city_name}...`);
        const BATCH_SIZE = 200;
        for (let i = 0; i < opinionsToInsert.length; i += BATCH_SIZE) {
            const batch = opinionsToInsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('community_opinions')
                .upsert(batch, {
                    onConflict: 'source,external_id',
                    ignoreDuplicates: false
                 });

            if (error) {
                console.error(` Supabase batch insert error for ${currentCityConfig.city_name} (batch ${i / BATCH_SIZE + 1}):`, error.message);
            } else {
                console.log(` Successfully inserted batch ${i / BATCH_SIZE + 1} of ${Math.ceil(opinionsToInsert.length / BATCH_SIZE)} for ${currentCityConfig.city_name}.`);
            }
        }
    } else {
        console.log(`No valid opinions with geocoding results to insert for ${currentCityConfig.city_name}.`);
    }

  } catch (error: any) {
    console.error(`💥 Top-level error during ingestion for ${currentCityConfig.city_name}:`, error.message || error);
  }
}

// --- Script Execution ---
// Ensure cityId is not null before calling
if (cityId !== null && cityConfig) {
    ingestData(cityConfig).catch(err => {
        console.error(`Error during opinion ingestion for city ${cityId}:`, err);
        process.exit(1);
    });
} else {
    console.error("City ID or City Config is invalid, cannot start ingestion.");
    process.exit(1);
}

function nodeFetch(cityApifyUrl: any) {
    throw new Error('Function not implemented.');
}
