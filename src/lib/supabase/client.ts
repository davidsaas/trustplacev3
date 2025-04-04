import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types' // Import from the generated types file

export const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
} 