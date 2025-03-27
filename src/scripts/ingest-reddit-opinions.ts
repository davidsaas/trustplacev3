// src/scripts/ingest-reddit-opinions.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import nlp from 'compromise';

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
const LA_BBOX = "-118.9500,33.7000,-117.6500,34.8200"; // Use slightly larger bbox to ensure context is caught
const LA_PROXIMITY = "-118.2437,34.0522"; // Lon, Lat

// <<< *** EXPAND THIS LIST with ALL areas you consider valid context *** >>>
const ACCEPTABLE_LA_CONTEXT_PLACES_LOWER = [
    'los angeles', 'santa monica', 'west hollywood', 'beverly hills',
    'culver city', 'venice', 'long beach', 'redondo beach', 'manhattan beach',
    'pasadena', 'burbank', 'glendale', 'inglewood', 'compton', 'torrance', // Add more as needed
    // Consider adding specific neighborhoods if context check fails otherwise
     'hollywood', 'downtown', 'chinatown', 'koreatown', 'echo park', 'silver lake',
     'highland park', 'arts district', 'little tokyo', 'hancock park', 'larchmont village',
     'century city', 'westwood', 'brentwood', 'mar vista', 'playa del rey', 'westchester'
].map(p => p.toLowerCase()); // Convert to lowercase for case-insensitive matching

// --- Initialization & Validation ---
if (!supabaseUrl || !supabaseServiceKey || !apifyDatasetUrl || !mapboxAccessToken) {
  console.error('🛑 Missing one or more environment variables. Check .env file.'); process.exit(1);
}
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// --- Geocoding Function with FINAL Refined Context Filtering ---
async function geocodeRedditItem(item: RedditItem): Promise<{ latitude: number; longitude: number; cityId: number | null } | null> {
    if (!mapboxAccessToken) return null;
    const textToAnalyze = `${item.title || ''}. ${item.body || ''}`;
    if (!textToAnalyze.trim()) return null;
    const doc = nlp(textToAnalyze);

    // --- NLP Query Extraction (same as before) ---
    let locationQuery = '';
    // ... (Keep the previous NLP extraction logic - ProperNoun+, Neighborhood, Place, City, downtown, chinatown, weho etc.) ...
    const properNounPlace = doc.match('#ProperNoun+ (as #Place|#Organization|#Address)').first().text('trim');
    const neighborhood = doc.match('#Neighborhood+').first().text('trim');
    if (properNounPlace) locationQuery = properNounPlace;
    else if (neighborhood) locationQuery = neighborhood;
    else {
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

    // --- Append Context (same as before) ---
    let mapboxQuery = locationQuery;
    if (!/\d/.test(locationQuery) && !ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.some(p => locationQuery.toLowerCase().includes(p)) && !locationQuery.toLowerCase().includes(' ca') && !locationQuery.toLowerCase().includes('california')) {
        mapboxQuery = `${locationQuery}, Los Angeles, CA`;
    }
    // console.log(`📍 NLP -> Mapbox query: "${mapboxQuery}" (Item ${item.id || item.parsedId})`);

    // --- Call Mapbox API (same as before) ---
    const encodedQuery = encodeURIComponent(mapboxQuery);
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${mapboxAccessToken}&limit=1&bbox=${LA_BBOX}&proximity=${LA_PROXIMITY}&types=neighborhood,locality,place,poi,address`;

    try {
        const geoResponse = await fetch(geocodeUrl);
        if (!geoResponse.ok) { console.error(`🗺️ Mapbox API error for "${mapboxQuery}": ${geoResponse.status}`); return null; }
        const geoData = await geoResponse.json() as MapboxResponse;

        if (geoData.features && geoData.features.length > 0) {
            const bestMatch = geoData.features[0];
            const [longitude, latitude] = bestMatch.center;
            if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

            // --- *** REVISED CONTEXT FILTERING V4 *** ---
            let isAcceptableContext = false;

            // Primary Check: Look through the context hierarchy provided by Mapbox
            if (bestMatch.context) {
                let foundAcceptablePlace = false;
                let foundLACounty = false;
                let foundCalifornia = false;

                for (const context of bestMatch.context) {
                    const contextTextLower = context.text.toLowerCase();
                    const contextIdPrefix = context.id.split('.')[0]; // e.g., "place", "locality", "district", "region"

                    // Check for acceptable places/localities
                    if (contextIdPrefix === 'place' || contextIdPrefix === 'locality') {
                        if (ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.includes(contextTextLower)) {
                            foundAcceptablePlace = true;
                        }
                    }
                    // Check for LA County
                    if (contextIdPrefix === 'district' && contextTextLower.includes('los angeles county')) {
                        foundLACounty = true;
                    }
                    // Check for California
                    if (contextIdPrefix === 'region' && contextTextLower.includes('california')) {
                        foundCalifornia = true;
                    }
                }
                 // Accept if we found California AND (either an acceptable place OR LA County)
                 if (foundCalifornia && (foundAcceptablePlace || foundLACounty)) {
                     isAcceptableContext = true;
                 }
            }

            // Fallback Check: If context array didn't confirm, check the full place_name string
            if (!isAcceptableContext && bestMatch.place_name) {
                 const placeNameLower = bestMatch.place_name.toLowerCase();
                 // Check if place_name includes an acceptable place AND 'california'
                 if (ACCEPTABLE_LA_CONTEXT_PLACES_LOWER.some(place => placeNameLower.includes(place)) && placeNameLower.includes('california')) {
                     isAcceptableContext = true;
                 }
                 // Also accept if it clearly mentions 'los angeles county' and 'california'
                 else if (placeNameLower.includes('los angeles county') && placeNameLower.includes('california')) {
                     isAcceptableContext = true;
                 }
            }

            // Final Rejection Check
            if (!isAcceptableContext) {
                console.warn(`🗺️ Geocoding result for "${mapboxQuery}" REJECTED: Context not valid LA region (${bestMatch.place_name || 'No Place Name'})`);
                return null; // Reject results outside desired area
            }
            // --- *** END REVISED FILTERING *** ---


            // If checks pass:
            // console.log(`✅ Geocoded "${mapboxQuery}" to [${latitude.toFixed(5)}, ${longitude.toFixed(5)}] (${bestMatch.place_name})`);
            return { latitude, longitude, cityId: DEFAULT_LA_CITY_ID };

        } else { return null; /* No Mapbox results */ }
    } catch (error: any) { console.error(`💥 Error during Mapbox API call for "${mapboxQuery}":`, error.message || error); return null; }
}

// --- Main Ingestion Logic (No changes needed here from previous) ---
async function ingestData() {
  console.log(`🚀 Starting Reddit opinion ingestion...`);
  
  if (!apifyDatasetUrl) {
    throw new Error('APIFY_REDDIT_DATASET_URL is not defined in environment variables');
  }
  
  console.log(`Fetching data from Apify: ${apifyDatasetUrl}`);
  try {
    const response = await fetch(apifyDatasetUrl as string);
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
        if (processedItemCount % 50 === 0) console.log(`   Processed ${processedItemCount}/${totalItems}...`);
        if (!item.body || !(item.id || item.parsedId)) { geocodeFailCount++; continue; }

        const geo = await geocodeRedditItem(item); // Await sequential calls

        if (geo) {
            geocodeSuccessCount++;
            opinionsToInsert.push({ /* ... mapping ... */
                external_id: item.id || item.parsedId, source: 'reddit', url: item.url || item.link,
                title: item.title, body: item.body, username: item.username, user_id_external: item.userId,
                community_name: item.communityName || item.parsedCommunityName, upvotes: item.upVotes,
                raw_data: item, latitude: geo.latitude, longitude: geo.longitude, city_id: geo.cityId,
                source_created_at: item.createdAt ? new Date(item.createdAt).toISOString() : null,
                source_scraped_at: item.scrapedAt ? new Date(item.scrapedAt).toISOString() : null,
            });
        } else { geocodeFailCount++; }
        // Optional delay: await new Promise(resolve => setTimeout(resolve, 60));
    } // End loop

    console.log('---');
    console.log(`Geocoding Summary: ${geocodeSuccessCount} succeeded, ${geocodeFailCount} failed/skipped.`);
    console.log(`💾 Prepared ${opinionsToInsert.length} opinions for DB.`);
    if (opinionsToInsert.length === 0) { console.log('🟡 No valid opinions to insert.'); return; }

    // ... (Batch insert/upsert logic) ...
    const BATCH_SIZE = 100; let totalDbProcessed = 0; let failedBatchCount = 0;
    console.log(`🚚 Inserting data in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < opinionsToInsert.length; i += BATCH_SIZE) {
        const batch = opinionsToInsert.slice(i, i + BATCH_SIZE); const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const { error } = await supabase.from('community_opinions').upsert(batch, { onConflict: 'external_id' });
        if (error) { console.error(`❌ DB Error (Batch ${batchNum}):`, error.message); failedBatchCount++; }
        else { totalDbProcessed += batch.length; console.log(`  -> Batch ${batchNum} processed.`); }
    }
    console.log('---');
    console.log(`✅ Ingestion finished. DB Processed: ${totalDbProcessed}.`);
    if (failedBatchCount > 0) console.log(`   Warning: ${failedBatchCount} batches had DB errors.`);

  } catch (error: any) { console.error('❌ Unhandled error during ingestion:', error.message || error); process.exit(1); }
}

ingestData();