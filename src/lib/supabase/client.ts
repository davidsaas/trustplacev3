import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types' // Import from the generated types file

// Create a singleton instance of the Supabase client
const supabaseClient = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Export the singleton instance
export const supabase = supabaseClient;

// Optional: Keep the function if needed elsewhere, but ensure it returns the singleton
export const createClient = () => {
  return supabaseClient;
};