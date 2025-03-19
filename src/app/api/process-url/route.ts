import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    // Check if the accommodation exists in our database
    const { data, error } = await supabase
      .from('accommodations')
      .select('id')
      .eq('source', source)
      .eq('external_id', externalId)
      .single()

    if (error || !data) {
      console.log('Accommodation not found:', { source, externalId })
      return NextResponse.json(
        { 
          exists: false,
          error: 'This accommodation is not in our database yet',
          notFound: true
        },
        { status: 404 }
      )
    }

    console.log('Accommodation found:', data.id)
    return NextResponse.json({
      success: true,
      exists: true,
      reportId: data.id
    })
  } catch (error) {
    console.error('Error processing URL:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 