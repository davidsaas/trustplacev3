import { createClient } from '@supabase/supabase-js'
import { Database } from '../lib/supabase'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { parseArgs } from 'node:util'

// Load environment variables
dotenv.config()

// --- REMOVE OLD HARDCODED URLS ---
// const AIRBNB_DATASET_URL = 'https://api.apify.com/v2/datasets/ahO69GU8VMAQiO3cu/items?clean=true&format=json'
// const BOOKING_DATASET_URL = 'https://api.apify.com/v2/datasets/f0zLgeObIt04pjSn4/items?clean=true&format=json'

// --- Argument Parsing ---
let cityId: number | null = null;
let cityConfig: any; // Declare cityConfig here to be accessible later

try {
  const args = parseArgs({
    options: {
      'city-id': { type: 'string' },
    },
    allowPositionals: true, // Allow if needed, but prefer named args
  });
  if (args.values['city-id']) {
    cityId = parseInt(args.values['city-id'], 10);
    if (isNaN(cityId)) {
        throw new Error("Invalid --city-id provided. Must be a number.");
    }
  } else {
     throw new Error("--city-id argument is required.");
  }
  console.log(`Processing for City ID: ${cityId}`);

  // --- Load City Configuration ---
  const configPath = path.resolve(process.cwd(), `src/config/cities/${cityId}.json`); // Use process.cwd() for more reliable path
  // console.log(`Loading city config from: ${configPath}`); // REMOVE
  const configFile = fs.readFileSync(configPath, 'utf-8');
  // --- Add logging for raw file content ---
  // console.log("DEBUG: Raw content read from config file:\\n", configFile); // REMOVE
  // --- End logging for raw file content ---

  // --- Add logging around JSON.parse ---
  // console.log("DEBUG: configFile type BEFORE parse:", typeof configFile); // REMOVE
  try {
    cityConfig = JSON.parse(configFile);
    // Log AFTER parse
    // console.log("DEBUG: cityConfig type AFTER parse:", typeof cityConfig); // REMOVE
    // console.log("DEBUG: cityConfig.apify_urls AFTER parse:", JSON.stringify(cityConfig?.apify_urls, null, 2)); // REMOVE
  } catch (parseError: any) {
    console.error("FATAL: Failed to parse city config JSON:", parseError.message);
    // console.error("Raw content leading to parse error:", configFile); // Keep this error context
    process.exit(1);
  }
  // --- End logging around JSON.parse ---

  // Updated Check: Expects apify_urls object with potential keys
  if (!cityConfig.apify_urls || typeof cityConfig.apify_urls !== 'object') {
      throw new Error("City config is missing or has invalid 'apify_urls' object.");
  }
  // Check for at least one accommodation URL
  if (!cityConfig.apify_urls.accommodations_airbnb && !cityConfig.apify_urls.accommodations_booking) {
      console.warn(`Warning: City config for ID ${cityId} is missing both 'accommodations_airbnb' and 'accommodations_booking' URLs in 'apify_urls'.`);
      // Decide if this is fatal or if the script should proceed with potentially empty data
      // For now, let's allow it to proceed but log a strong warning.
  }

  console.log(`Loaded config for ${cityConfig.city_name}`);

} catch (err: any) { // Catch specific error types if needed
  console.error("Initialization error:", err.message);
  process.exit(1);
}

// Use URLs from config - provide empty string if missing to avoid runtime errors in fetch
const AIRBNB_DATASET_URL = cityConfig?.apify_urls?.accommodations_airbnb || ''; // Revert to optional chaining
const BOOKING_DATASET_URL = cityConfig?.apify_urls?.accommodations_booking || ''; // Revert to optional chaining

// --- Add immediate logging ---
// console.log(`DEBUG: Assigned AIRBNB_DATASET_URL: '${AIRBNB_DATASET_URL}'`); // REMOVE
// console.log(`DEBUG: Assigned BOOKING_DATASET_URL: '${BOOKING_DATASET_URL}'`); // REMOVE
// --- End immediate logging ---

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ApifyAirbnbItem = {
  id: string
  url: string
  name: string
  thumbnail: string
  price?: {
    label: string
    qualifier: string
    price: string
    originalPrice: string
    discountedPrice: string
  }
  coordinates: {
    latitude: number
    longitude: number
  }
  rating?: {
    accuracy?: number
    checking?: number
    cleanliness?: number
    communication?: number
    location?: number
    value?: number
    guestSatisfaction?: number
    reviewsCount?: number
  }
  propertyType?: string
  roomType?: string
  personCapacity?: number
  bedrooms?: number
  bathrooms?: number
  host?: {
    name: string
    id: string
    isSuperhost: boolean
  }
  seoTitle?: string
  sharingConfigTitle?: string
  metaDescription?: string
  amenities?: Array<{
    title: string
    values?: Array<{
      title: string
      subtitle?: string
      icon?: string
      available?: boolean
    }>
  }>
}

type ApifyBookingItem = {
  url: string
  name: string
  type?: string
  price?: number | null
  currency?: string | null
  rating?: number
  reviews?: number
  description?: string
  location?: {
    lat: string
    lng: string
  }
  address?: {
    full: string
    postalCode?: string
    street?: string
    country?: string
    region?: string
  }
  image?: string | null
  images?: string[]
  facilities?: Array<{
    name: string
    overview?: string | null
    facilities?: Array<{
      name: string
      additionalInfo: string[]
    }>
  }>
  categoryReviews?: Array<{
    title: string
    score: number
  }>
}

async function fetchData(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching data from ${url}:`, error)
    return []
  }
}

// Map room types to our enum values
function mapRoomType(type: string | undefined): string {
  if (!type) return 'entire_home'; // Default to entire_home if no type is provided
  
  const typeMap: Record<string, string> = {
    'entire home/apt': 'entire_home',
    'private room': 'private_room',
    'shared room': 'shared_room',
    'hotel room': 'hotel_room',
    'apartment': 'entire_home',
    'Apartment': 'entire_home',
    'Hotel': 'hotel_room',
    'House': 'entire_home'
  }
  
  return typeMap[type.toLowerCase()] || 'entire_home'
}

// Improved price extraction function
function extractPrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  
  // Remove common currency symbols (£, $, €), commas, and trim whitespace
  const cleaned = priceStr
    .replace(/[£$€]/g, '')      // Remove common currency symbols
    .replace(/,/g, '')          // Remove commas
    .split('/')[0]              // Take the part before potential "/ night"
    .split(' ')[0]              // Take the part before potential " price"
    .trim();
    
  if (cleaned === '') {
      console.warn(`[extractPrice] Price string became empty after cleaning: "${priceStr}"`);
      return null;
  }

  const priceNum = parseFloat(cleaned);

  if (isNaN(priceNum)) {
    console.warn(`[extractPrice] Failed to parse price from string: "${priceStr}". Cleaned: "${cleaned}"`);
    return null;
  }
  
  return priceNum;
}

// Helper function to safely parse numeric fields
function parseNumericField(value: any, fieldName: string, itemId: string): number | null {
    if (value === null || value === undefined) {
        return null; // Allow nulls
    }
    const num = Number(value);
    if (isNaN(num)) {
        console.warn(`Invalid numeric value for field '${fieldName}' in Airbnb listing ${itemId}. Value: ${JSON.stringify(value)}. Setting to null.`);
        return null;
    }
    return num;
}

function transformAirbnbData(item: ApifyAirbnbItem, cityIdToAssign: number) {
  // console.log(`[transformAirbnbData] Processing item URL: ${item.url || item.id || 'N/A'}`); // REMOVE
  // console.log('[transformAirbnbData] Input item:', JSON.stringify(item, null, 2)); // REMOVE

  // Skip items without required base fields (ID, URL, thumbnail, price object)
  if (!item.id || !item.url || !item.thumbnail || typeof item.price !== 'object' || item.price === null) {
    console.warn(`[transformAirbnbData] Missing required base fields (id, url, thumbnail, or price object) for an Airbnb listing. Skipping. URL: ${item.url || 'N/A'}, ID: ${item.id || 'N/A'}`) // Uncommented warning
    return null
  }
  
  // Attempt to extract price *before* primary required field check involving price.price
  const price = extractPrice(item.price?.price);

  // Now check for required price *value* and coordinates
  if (price === null || !item.coordinates?.latitude || !item.coordinates?.longitude) {
    // Add more specific warning depending on what failed
    let reason = [];
    if (price === null) reason.push("price extraction failed");
    if (!item.coordinates?.latitude) reason.push("missing latitude");
    if (!item.coordinates?.longitude) reason.push("missing longitude");
    console.warn(`[transformAirbnbData] Skipping Airbnb listing ${item.id}. Reason(s): ${reason.join(', ')}. Original price string: ${item.price?.price}`); // Uncommented and improved warning
    return null;
  }

  // Get title from seoTitle or sharingConfigTitle
  const title = item.seoTitle?.split(' - ')[0] || item.sharingConfigTitle?.split(' · ')[0] || 'Untitled Listing'

  // Safely parse numeric fields using the helper
  const rating = parseNumericField(item.rating?.guestSatisfaction, 'rating.guestSatisfaction', item.id);
  const totalReviews = parseNumericField(item.rating?.reviewsCount, 'rating.reviewsCount', item.id);

  // Extract amenities
  let amenities: string[] | null = null;
  if (Array.isArray(item.amenities)) {
      const amenityTitles = new Set<string>();
      item.amenities.forEach(category => {
          if (Array.isArray(category.values)) {
              category.values.forEach(value => {
                  if (value.title && value.available) { // Only add available amenities with a title
                      amenityTitles.add(value.title.trim());
                  }
              });
          }
      });
      if (amenityTitles.size > 0) {
          amenities = Array.from(amenityTitles);
      }
  }

  // Clean and extract description
  let description: string | null = null;
  if (item.metaDescription) {
    // Regex to match the prefix: Month Day, Year - Type for $Price.
    const prefixRegex = /^[A-Za-z]{3}\s\d{1,2},\s\d{4}\s-\s.*?\sfor\s\$\d+\.?\s*/;
    description = item.metaDescription.replace(prefixRegex, '').trim();
    if (description === "") { // If removing prefix leaves empty string, set to null
      description = null;
    }
  }

  const transformed = {
    city_id: cityIdToAssign,
    source: 'airbnb' as const,
    external_id: item.id,
    url: item.url,
    name: title,
    image_url: item.thumbnail,
    price_per_night: price, // Already validated above
    latitude: item.coordinates.latitude.toString(), // Already validated above
    longitude: item.coordinates.longitude.toString(), // Already validated above
    property_type: item.propertyType || null,
    room_type: mapRoomType(item.roomType),
    rating: rating,
    total_reviews: totalReviews,
    host_name: item.host?.name || null,
    host_id: item.host?.id || null,
    last_scraped_at: new Date().toISOString(),
    amenities: amenities, // Add the extracted amenities
    description: description // Use the cleaned description
  };

  // console.log('[transformAirbnbData] Output object:', JSON.stringify(transformed, null, 2)); // REMOVE
  return transformed;
}

function transformBookingData(item: ApifyBookingItem, cityIdToAssign: number) {
  // console.log(`[transformBookingData] Processing item URL: ${item.url || item.name || 'N/A'}`); // REMOVE
  // Get the first image from images array if main image is null
  const imageUrl = item.image || (item.images && item.images.length > 0 ? item.images[0] : null)
  
  // Skip items without images
  if (!imageUrl) {
    console.warn(`Missing image for Booking.com listing ${item.url}`)
    return null
  }

  // More robust external_id extraction
  const urlObj = new URL(item.url)
  const pathParts = urlObj.pathname.split('/')
  const hotelPart = pathParts.find(part => part.includes('.html')) || pathParts[pathParts.length - 1]
  const external_id = hotelPart
    .replace(/\.html$/, '')
    .replace(/\.[a-z-]+\.html$/, '')
    .split('.')[0] // Take only the first part before any dots
    
  // Validate external_id
  if (!external_id) {
    console.warn(`Could not extract valid external_id from URL: ${item.url}`)
    return null
  }

  // Extract amenities from facilities
  const amenities = item.facilities?.flatMap(facility => 
    facility.facilities?.map(f => f.name) || []
  ).filter(Boolean) || []

  return {
    city_id: cityIdToAssign,
    source: 'booking' as const,
    external_id,
    url: item.url,
    name: item.name,
    image_url: imageUrl,
    price_per_night: item.price || null, // Allow null prices
    currency: item.currency || 'USD',
    latitude: item.location?.lat || null,
    longitude: item.location?.lng || null,
    neighborhood: item.address?.full || null,
    property_type: item.type || null,
    room_type: mapRoomType(item.type),
    rating: item.rating || null, // Keep original Booking.com rating (out of 10)
    total_reviews: item.reviews || null,
    description: item.description || null,
    amenities: amenities.length > 0 ? amenities : null,
    address: {
      street: item.address?.street || null,
      postal_code: item.address?.postalCode || null,
      country: item.address?.country || null,
      region: item.address?.region || null
    },
    last_scraped_at: new Date().toISOString()
  }
}

async function importAccommodations(cityIdToImport: number) {
  console.log(`🚀 Starting accommodation import for City ID: ${cityIdToImport}...`);
  console.log(`Using config for ${cityConfig.city_name}`);

  let airbnbData: ApifyAirbnbItem[] = [];
  if (AIRBNB_DATASET_URL) {
      console.log(`Fetching Airbnb data from: ${AIRBNB_DATASET_URL}`);
      airbnbData = await fetchData(AIRBNB_DATASET_URL);
      console.log(`Found ${airbnbData.length} Airbnb listings for ${cityConfig.city_name}`);
  } else {
      console.log(`Skipping Airbnb fetch: No URL found in config for ${cityConfig.city_name}.`);
  }

  let bookingData: ApifyBookingItem[] = [];
  if (BOOKING_DATASET_URL) {
      console.log(`Fetching Booking.com data from: ${BOOKING_DATASET_URL}`);
      bookingData = await fetchData(BOOKING_DATASET_URL);
      console.log(`Found ${bookingData.length} Booking.com listings for ${cityConfig.city_name}`);
  } else {
      console.log(`Skipping Booking.com fetch: No URL found in config for ${cityConfig.city_name}.`);
  }

  // Transform the data, passing cityId
  const transformedAirbnb = airbnbData.map(item => transformAirbnbData(item, cityIdToImport)).filter((item): item is NonNullable<ReturnType<typeof transformAirbnbData>> => item !== null);
  // console.log(`DEBUG: transformedAirbnb length after map/filter: ${transformedAirbnb.length}`); // REMOVE
  /* REMOVE multi-line debug block
  if (transformedAirbnb.length > 2600) {
    // Add detailed logging for the item potentially causing issues BEFORE concatenation
    console.log(`DEBUG: Item at index 2600 in transformedAirbnb (PRE-CONCAT) - Source: ${transformedAirbnb[2600]?.source}`);
    console.log(`DEBUG: Item at index 2600 in transformedAirbnb (PRE-CONCAT) - Price: ${JSON.stringify(transformedAirbnb[2600]?.price_per_night)}`);
    console.log(`DEBUG: Item at index 2600 in transformedAirbnb (PRE-CONCAT) - URL: ${transformedAirbnb[2600]?.url}`);
  }
  */
  // --- DEBUG LOGS START --- // Remove or comment out original debug block if redundant
  // console.log(`DEBUG: transformedAirbnb length: ${transformedAirbnb.length}`);
  // if (transformedAirbnb.length > 0) {
  //   console.log(`DEBUG: First item source in transformedAirbnb: ${transformedAirbnb[0]?.source}`);
  // }
  // --- DEBUG LOGS END --- //

  const transformedBooking = bookingData.map(item => transformBookingData(item, cityIdToImport)).filter((item): item is NonNullable<ReturnType<typeof transformBookingData>> => item !== null);
  // console.log(`DEBUG: transformedBooking length after map/filter: ${transformedBooking.length}`); // REMOVE
  // --- DEBUG LOGS START --- // Remove or comment out original debug block if redundant
  // console.log(`DEBUG: transformedBooking length: ${transformedBooking.length}`);
  // if (transformedBooking.length > 0) {
  //   console.log(`DEBUG: First item source in transformedBooking: ${transformedBooking[0]?.source}`);
  // }
  // --- DEBUG LOGS END --- //

  const allAccommodations = [...transformedAirbnb, ...transformedBooking];

  // --- MORE DEBUG LOGS --- // Modify existing debug block
  // console.log(`DEBUG: allAccommodations length after concatenation: ${allAccommodations.length}`); // REMOVE
  /* REMOVE multi-line debug block
  if (allAccommodations.length > 0) {
      console.log(`DEBUG: First item source in allAccommodations (POST-CONCAT): ${allAccommodations[0]?.source}`);
  }
  // Check item around the failure point (index 2600 is start of batch 27)
  if (allAccommodations.length > 2600) {
      console.log(`DEBUG: Item at index 2600 in allAccommodations (POST-CONCAT) - Source: ${allAccommodations[2600]?.source}`);
      console.log(`DEBUG: Item at index 2600 in allAccommodations (POST-CONCAT) - Price: ${JSON.stringify(allAccommodations[2600]?.price_per_night)}`);
      console.log(`DEBUG: Item at index 2600 in allAccommodations (POST-CONCAT) - URL: ${allAccommodations[2600]?.url}`);
  }
  */
  // --- MORE DEBUG LOGS END --- //

  console.log(`Total valid accommodations found: ${allAccommodations.length}`); // Adjusted wording slightly

  if (allAccommodations.length === 0) {
    console.log(`No valid accommodations to insert for ${cityConfig.city_name}. Import finished early.`);
    return; // Exit if no data
  }

  // Insert data in batches
  const BATCH_SIZE = 100
  console.log(`Inserting ${allAccommodations.length} accommodations in batches of ${BATCH_SIZE}...`)

  for (let i = 0; i < allAccommodations.length; i += BATCH_SIZE) {
    const batch = allAccommodations.slice(i, i + BATCH_SIZE)
    const batchNumber = Math.ceil(i / BATCH_SIZE) + 1; // Calculate batch number
    // console.log(`--- Preparing Batch ${batchNumber} ---`); // REMOVE - Too noisy

    // Add specific logging for the problematic batch range BEFORE upsert
    /* REMOVE multi-line debug block
    if (batchNumber >= 26 && batchNumber <= 28) { // Log batches 26, 27, 28
        console.log(`DEBUG: Batch ${batchNumber} - First Item Check (Index ${i} in allAccommodations)`);
        console.log(`DEBUG: Batch ${batchNumber} - Source: ${batch[0]?.source}`);
        console.log(`DEBUG: Batch ${batchNumber} - Price: ${JSON.stringify(batch[0]?.price_per_night)}`);
        console.log(`DEBUG: Batch ${batchNumber} - URL: ${batch[0]?.url}`);
        // Optional: Log the second item if helpful
        // if (batch.length > 1) {
        //     console.log(`DEBUG: Batch ${batchNumber} - Second item source: ${batch[1]?.source}`);
        //     console.log(`DEBUG: Batch ${batchNumber} - Second item price: ${JSON.stringify(batch[1]?.price_per_night)}`);
        // }
    }
    */

    // Optional: Log the actual batch data (keep commented)
    // console.log(`Batch ${batchNumber} Data:`, JSON.stringify(batch, null, 2));

    const { error, data } = await supabase
      .from('accommodations')
      .upsert(batch, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error(`❌ Error upserting Batch ${batchNumber}:`, error.message); // Use batchNumber
      console.error('Error Details:', JSON.stringify(error, null, 2));
      // Log the first item of the failing batch for inspection
      if (batch.length > 0) {
          console.error(`First item in failed batch (${batchNumber}):`, JSON.stringify(batch[0], null, 2)); // Use batchNumber
      }
    } else {
      console.log(`✅ Batch ${batchNumber}/${Math.ceil(allAccommodations.length / BATCH_SIZE)}: Upserted ${data?.length ?? 0} records for ${cityConfig.city_name}`); // Simplified success log
      // Optional: Log the data returned by select() (keep commented)
      // if (data && data.length > 0) {
      //   console.log(`Upserted IDs from Batch ${batchNumber}:`, data.map(d => d.id || d.external_id));
      // }
    }
  }

  console.log(`🏁 Import completed for ${cityConfig.city_name}!`); // Restore final log
}

// Run the import, passing the parsed cityId
// Make sure cityId is not null before calling
if (cityId !== null) {
    importAccommodations(cityId).catch(err => {
        console.error(`Error during import for city ${cityId}:`, err);
        process.exit(1);
    });
} else {
    // This case should ideally be prevented by the initial argument check,
    // but adding it for safety.
    console.error("City ID is null, cannot start import.");
    process.exit(1);
}