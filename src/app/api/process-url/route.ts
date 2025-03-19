import { NextResponse } from 'next/server'
import { findAccommodationBySourceAndExternalId } from '@/lib/db/accommodations'
import type { AccommodationSource } from '@/lib/utils/url'

export async function POST(request: Request) {
  try {
    const { source, externalId } = await request.json()

    if (!source || !externalId) {
      return NextResponse.json(
        { error: 'Source and externalId are required' },
        { status: 400 }
      )
    }

    console.log('Searching for accommodation:', { source, externalId })

    // Check if the accommodation exists in our database using server client
    const accommodation = await findAccommodationBySourceAndExternalId(
      source as AccommodationSource,
      externalId,
      true // Use server client
    )

    if (!accommodation) {
      console.log('Accommodation not found')
      return NextResponse.json(
        { 
          exists: false,
          error: 'This accommodation is not in our database yet'
        },
        { status: 404 }
      )
    }

    console.log('Accommodation found:', accommodation.id)
    return NextResponse.json({
      exists: true,
      id: accommodation.id
    })
  } catch (error) {
    console.error('Error processing URL:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 