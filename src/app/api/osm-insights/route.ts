import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define the structure for our insights
interface OSMInsight {
  level: 'Low' | 'Medium' | 'High' | 'Not Found' // Simplified level based on counts
  count: number // Raw count of features found
}

interface OSMInsightsResponse {
  pedestrian: OSMInsight
  transport: OSMInsight
  convenience: OSMInsight
  dining: OSMInsight
  nightlife: OSMInsight
  greenSpace: OSMInsight
}

// Overpass API endpoint
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
// Radius in meters
const SEARCH_RADIUS = 500

// Helper to categorize counts into levels
const getLevel = (count: number): OSMInsight['level'] => {
  if (count === 0) return 'Not Found'
  if (count <= 3) return 'Low'
  if (count <= 10) return 'Medium'
  return 'High'
}

// --- Default "Not Found" insight ---
const notFoundInsight: OSMInsight = { level: 'Not Found', count: 0 };

// Define the tags we are looking for in each category
const categoryTags = {
    pedestrian: [
        { key: 'highway', value: 'footway' },
        { key: 'highway', value: 'pedestrian' },
        { key: 'highway', value: 'crossing' },
        { key: 'sidewalk', value: 'both' },
        { key: 'sidewalk', value: 'left' },
        { key: 'sidewalk', value: 'right' },
        { key: 'lit', value: 'yes' },
    ],
    transport: [
        { key: 'highway', value: 'bus_stop' },
        { key: 'amenity', value: 'bus_station' },
        { key: 'railway', value: 'station' },
        { key: 'railway', value: 'tram_stop' },
        { key: 'railway', value: 'subway_entrance' },
    ],
    convenience: [
        { key: 'shop', value: 'supermarket' },
        { key: 'shop', value: 'convenience' },
        { key: 'amenity', value: 'pharmacy' },
    ],
    dining: [
        { key: 'amenity', value: 'restaurant' },
        { key: 'amenity', value: 'cafe' },
    ],
    nightlife: [
        { key: 'amenity', value: 'bar' },
        { key: 'amenity', value: 'pub' },
        { key: 'amenity', value: 'nightclub' },
    ],
    greenSpace: [
        { key: 'leisure', value: 'park' },
        { key: 'leisure', value: 'playground' },
    ],
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  console.log(`[OSM API - V4] Received request for lat: ${lat}, lng: ${lng}`);

  if (!lat || !lng) {
    console.error('[OSM API - V4] Missing latitude or longitude');
    return NextResponse.json({ error: 'Missing latitude or longitude' }, { status: 400 })
  }

  const latitude = parseFloat(lat)
  const longitude = parseFloat(lng)

  if (isNaN(latitude) || isNaN(longitude)) {
     console.error(`[OSM API - V4] Invalid coordinates: lat=${lat}, lng=${lng}`);
    return NextResponse.json({ error: 'Invalid latitude or longitude' }, { status: 400 })
  }

  // *** QUERY TO FETCH ELEMENTS, NOT COUNTS ***
  const query = `
    [out:json][timeout:25];
    (
      // Pedestrian Friendliness
      node["highway"="footway"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["highway"="footway"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["highway"="pedestrian"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["highway"="pedestrian"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["highway"="crossing"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["sidewalk"="both"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["sidewalk"="left"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["sidewalk"="right"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["lit"="yes"](around:${SEARCH_RADIUS},${latitude},${longitude});

      // Public Transport
      node["highway"="bus_stop"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["amenity"="bus_station"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["railway"="station"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["railway"="tram_stop"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["railway"="subway_entrance"](around:${SEARCH_RADIUS},${latitude},${longitude});

      // Basic Conveniences
      node["shop"="supermarket"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["shop"="convenience"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["amenity"="pharmacy"](around:${SEARCH_RADIUS},${latitude},${longitude});

      // Dining & Cafe
      node["amenity"="restaurant"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["amenity"="cafe"](around:${SEARCH_RADIUS},${latitude},${longitude});

      // Nightlife
      node["amenity"="bar"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["amenity"="pub"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["amenity"="nightclub"](around:${SEARCH_RADIUS},${latitude},${longitude});

      // Green Space (Nodes and Ways)
      node["leisure"="park"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["leisure"="park"](around:${SEARCH_RADIUS},${latitude},${longitude});
      node["leisure"="playground"](around:${SEARCH_RADIUS},${latitude},${longitude});
      way["leisure"="playground"](around:${SEARCH_RADIUS},${latitude},${longitude});
    );
    out; // <-- Changed from 'out count;' to 'out;'
  `;
  // *** END QUERY CHANGE ***

  console.log('[OSM API - V4 Cache] Sending Query to Fetch Elements:', query);

  try {
    console.time('[OSM API - V4 Cache] Overpass Fetch Duration');
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 60 * 60 * 12 } // Revalidate (cache) for 12 hours (in seconds)
    })
    console.timeEnd('[OSM API - V4 Cache] Overpass Fetch Duration');

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OSM API - V4] Overpass API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Overpass API error: ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`[OSM API - V4 Cache] Received ${data.elements?.length || 0} elements from Overpass.`);
    // console.log('[OSM API - V4] Received Overpass Data:', JSON.stringify(data, null, 2)); // Optional: uncomment for detailed data view

    // *** MANUALLY COUNT ELEMENTS BY CATEGORY ***
    let pedestrianCount = 0;
    let transportCount = 0;
    let convenienceCount = 0;
    let diningCount = 0;
    let nightlifeCount = 0;
    let greenSpaceCount = 0;

    const elements = data.elements || [];

    for (const element of elements) {
        if (!element.tags) continue; // Skip elements without tags

        // Check Pedestrian tags
        if (categoryTags.pedestrian.some(tag => element.tags[tag.key] === tag.value)) {
            pedestrianCount++;
            // Continue to next element if counted, avoid double counting if element has multiple relevant tags
            // continue; // Decide if an element can belong to multiple categories or just the first match
        }
        // Check Transport tags (use else if if an element belongs to only one category)
        if (categoryTags.transport.some(tag => element.tags[tag.key] === tag.value)) {
            transportCount++;
            // continue;
        }
        // Check Convenience tags
        if (categoryTags.convenience.some(tag => element.tags[tag.key] === tag.value)) {
            convenienceCount++;
            // continue;
        }
        // Check Dining tags
        if (categoryTags.dining.some(tag => element.tags[tag.key] === tag.value)) {
            diningCount++;
            // continue;
        }
        // Check Nightlife tags
        if (categoryTags.nightlife.some(tag => element.tags[tag.key] === tag.value)) {
            nightlifeCount++;
            // continue;
        }
        // Check Green Space tags
        if (categoryTags.greenSpace.some(tag => element.tags[tag.key] === tag.value)) {
            greenSpaceCount++;
            // continue;
        }
    }
    // *** END MANUAL COUNTING ***

    console.log('[OSM API - V4 Cache] Manually Counted Categories:', { pedestrianCount, transportCount, convenienceCount, diningCount, nightlifeCount, greenSpaceCount });

    // Prepare the response object
    const insights: OSMInsightsResponse = {
      pedestrian: { level: getLevel(pedestrianCount), count: pedestrianCount },
      transport: { level: getLevel(transportCount), count: transportCount },
      convenience: { level: getLevel(convenienceCount), count: convenienceCount },
      dining: { level: getLevel(diningCount), count: diningCount },
      nightlife: { level: getLevel(nightlifeCount), count: nightlifeCount },
      greenSpace: { level: getLevel(greenSpaceCount), count: greenSpaceCount },
    }

    console.log('[OSM API - V4 Cache] Sending Insights Response:', insights);
    return NextResponse.json(insights)

  } catch (error) {
    console.error('[OSM API - V4] Error fetching or processing OSM data:', error)
     const errorInsights: OSMInsightsResponse = {
      pedestrian: notFoundInsight, transport: notFoundInsight, convenience: notFoundInsight,
      dining: notFoundInsight, nightlife: notFoundInsight, greenSpace: notFoundInsight,
    }
    return NextResponse.json(errorInsights, { status: 500 })
  }
}

// Add type definition for the response structure if needed elsewhere
export type { OSMInsightsResponse, OSMInsight } 