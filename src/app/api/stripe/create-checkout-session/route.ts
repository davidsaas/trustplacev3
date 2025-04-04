import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
// @ts-expect-error - TS checker seems unable to find this export despite it existing
import { createRouteHandlerClient } from '@supabase/ssr';
import { stripe } from '@/lib/stripe/server'; // We'll create this Stripe client next
import { getURL } from '@/lib/utils/helpers'; // Revert back to alias
import type { Database } from '@/lib/supabase/database.types'; // Import generated types

// Ensure environment variables are loaded (consider using a validation library like Zod)
const STRIPE_PRICE_ID = process.env.YOUR_STRIPE_PRICE_ID;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_PRICE_ID) {
  console.error('Missing environment variable: YOUR_STRIPE_PRICE_ID');
  // Optionally throw an error during build or startup
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
    // Optionally throw an error during build or startup
}


export async function POST(req: Request) {
  const cookieStore = cookies();
  // Use service role client for backend operations like querying/updating profiles
  const supabaseAdmin = createRouteHandlerClient<Database>(
    { cookies: () => cookieStore },
    { supabaseKey: SUPABASE_SERVICE_ROLE_KEY } // Use service role key
  );

  try {
    // 1. Get User
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user or no user found:', userError);
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Retrieve or Create Stripe Customer
    let customerId: string;

    // Check if user profile exists and has a stripe_customer_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = 'No rows found'
      console.error('Error fetching profile:', profileError);
      throw new Error('Could not fetch user profile.');
    }

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
      console.log(`Found existing Stripe Customer ID: ${customerId} for user ${user.id}`);
    } else {
      console.log(`No Stripe Customer ID found for user ${user.id}. Creating new customer...`);
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id, // Link Stripe customer to Supabase user
        },
      });
      customerId = customer.id;
      console.log(`Created new Stripe Customer ID: ${customerId} for user ${user.id}`);

      // Update the user's profile in Supabase with the new Stripe Customer ID
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating profile with Stripe Customer ID:', updateError);
        // Consider how to handle this - maybe retry or log for manual intervention
        throw new Error('Failed to update user profile with Stripe ID.');
      }
       console.log(`Successfully updated profile for user ${user.id} with Stripe Customer ID.`);
    }

    // 3. Create Stripe Checkout Session
    if (!STRIPE_PRICE_ID) {
        throw new Error('Stripe Price ID is not configured.');
    }

    const baseUrl = getURL(); // Helper function to get your site's base URL
    // Construct success/cancel URLs relative to the current request or base URL
    // Important: Use the actual report ID if needed in the URL
    // For now, using a placeholder - you might need to pass the report ID from the frontend request
    const reportIdPlaceholder = 'some-report-id'; // Replace with actual ID logic if needed
    const successUrl = `${baseUrl}/safety-report/${reportIdPlaceholder}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/safety-report/${reportIdPlaceholder}`;


    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true, // Optional
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Add metadata to link the session back to your Supabase user in webhooks
      metadata: {
        supabase_user_id: user.id,
      },
    });

    if (!session.url) {
        console.error('Stripe session creation failed: No URL returned.');
        throw new Error('Could not create Stripe Checkout Session.');
    }

    // 4. Return the session URL
    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    // Return a generic error message to the client for security
    return new NextResponse(`Error creating checkout session: ${errorMessage}`, { status: 500 });
  }
}