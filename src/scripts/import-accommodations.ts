import { createClient } from '@supabase/supabase-js'
import { Database } from '../lib/supabase'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const AIRBNB_DATASET_URL = 'https://api.apify.com/v2/datasets/ahO69GU8VMAQiO3cu/items?clean=true&format=json'
const BOOKING_DATASET_URL = 'https://api.apify.com/v2/datasets/f0zLgeObIt04pjSn4/items?clean=true&format=json'

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

function extractPrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  const match = priceStr.match(/\$(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function transformAirbnbData(item: ApifyAirbnbItem) {
  // Skip items without required fields
  if (!item.thumbnail || !item.price?.price) {
    console.warn(`Missing required fields for Airbnb listing ${item.id}`)
    return null
  }

  const price = extractPrice(item.price.price)
  if (!price) {
    console.warn(`Invalid price format for Airbnb listing ${item.id}`)
    return null
  }

  // Get title from seoTitle or sharingConfigTitle
  const title = item.seoTitle?.split(' - ')[0] || item.sharingConfigTitle?.split(' · ')[0] || 'Untitled Listing'

  return {
    source: 'airbnb' as const,
    external_id: item.id,
    url: item.url,
    name: title,
    image_url: item.thumbnail,
    price_per_night: price,
    latitude: item.coordinates?.latitude?.toString() || null,
    longitude: item.coordinates?.longitude?.toString() || null,
    neighborhood: null,
    property_type: item.propertyType || null,
    room_type: mapRoomType(item.roomType),
    bedrooms: item.bedrooms || null,
    bathrooms: item.bathrooms || null,
    max_guests: item.personCapacity || null,
    rating: item.rating?.guestSatisfaction || null, // Keep original Airbnb rating (out of 5)
    total_reviews: item.rating?.reviewsCount || null,
    host_name: item.host?.name || null,
    host_id: item.host?.id || null,
    host_is_superhost: item.host?.isSuperhost || null,
    last_scraped_at: new Date().toISOString()
  }
}

function transformBookingData(item: ApifyBookingItem) {
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

async function importAccommodations() {
  console.log('🚀 Starting accommodation import...')

  // Fetch data from both sources
  console.log('Fetching Airbnb data...')
  const airbnbData: ApifyAirbnbItem[] = await fetchData(AIRBNB_DATASET_URL)
  console.log(`Found ${airbnbData.length} Airbnb listings`)

  console.log('Fetching Booking.com data...')
  const bookingData: ApifyBookingItem[] = await fetchData(BOOKING_DATASET_URL)
  console.log(`Found ${bookingData.length} Booking.com listings`)

  // Transform the data and filter out items without images
  const transformedAirbnb = airbnbData.map(transformAirbnbData).filter((item): item is NonNullable<typeof item> => item !== null)
  const transformedBooking = bookingData.map(transformBookingData).filter((item): item is NonNullable<typeof item> => item !== null)
  
  // Check for duplicates before merging
  const duplicateCheck = new Set()
  type AccommodationItem = {
    external_id: string;
    [key: string]: unknown;
  }
  const checkDuplicates = (items: AccommodationItem[], source: string) => {
    items.forEach(item => {
      if (item) {
        const key = `${source}-${item.external_id}`
        if (duplicateCheck.has(key)) {
          console.warn(`Duplicate found: ${key}`)
        }
        duplicateCheck.add(key)
      }
    })
  }

  checkDuplicates(transformedAirbnb, 'airbnb')
  checkDuplicates(transformedBooking, 'booking')

  const allAccommodations = [...transformedAirbnb, ...transformedBooking]

  console.log(`Processing ${transformedAirbnb.length} Airbnb and ${transformedBooking.length} Booking.com listings with valid images`)

  // Insert data in batches
  const BATCH_SIZE = 100
  console.log(`Inserting ${allAccommodations.length} accommodations in batches of ${BATCH_SIZE}...`)

  for (let i = 0; i < allAccommodations.length; i += BATCH_SIZE) {
    const batch = allAccommodations.slice(i, i + BATCH_SIZE)
    const { error, data } = await supabase
      .from('accommodations')
      .upsert(batch, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error(`Error upserting batch ${i / BATCH_SIZE + 1}:`, error)
      console.error('Problematic records:', batch.map(item => ({
        source: item.source,
        external_id: item.external_id,
        url: item.url
      })))
    } else {
      console.log(`Successfully upserted ${data?.length} records in batch ${i / BATCH_SIZE + 1} of ${Math.ceil(allAccommodations.length / BATCH_SIZE)}`)
    }
  }

  console.log('✅ Import completed!')
}

// Run the import
importAccommodations().catch(console.error)