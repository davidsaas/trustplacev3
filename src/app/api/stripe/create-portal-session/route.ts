import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Stripe from 'stripe';
import { getURL } from '@/lib/utils/helpers'; // Use the correct helper
import type { Database } from '@/lib/supabase/database.types';

// Initialize Stripe (ensure STRIPE_SECRET_KEY is in your .env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Match the version used elsewhere
  typescript: true,
});

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

  try {
    // 1. Get User Session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Portal Session Error: Unauthorized - No user session found.');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Fetch User's Profile to get Stripe Customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    // Handle profile fetch errors (excluding 'not found')
    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = 'Row not found'
      console.error(`Portal Session Error: Error fetching profile for user ${user.id}:`, profileError);
      return new NextResponse('Internal Server Error fetching profile', { status: 500 });
    }

    // 3. Check if Stripe Customer ID exists
    const customerId = profile?.stripe_customer_id;
    if (!customerId) {
      console.error(`Portal Session Error: No Stripe customer ID found for user ${user.id}. Cannot create portal session.`);
      // You might want to redirect the user to the subscription page or show an error message
      return new NextResponse('Stripe customer ID not found for this user.', { status: 400 });
    }

    // 4. Create Stripe Billing Portal Session
    const baseUrl = getURL();
    // Define where Stripe should redirect the user back to after they finish managing their subscription
    const returnUrl = `${baseUrl}/account`; // Example: redirect to an account page

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      if (!portalSession.url) {
          console.error(`Portal Session Error: Stripe portal session created for customer ${customerId} but missing URL.`);
          return new NextResponse('Internal Server Error: Failed to create portal session URL', { status: 500 });
      }

      // 5. Return Portal Session URL
      console.log(`Created Stripe Portal session ${portalSession.id} for customer ${customerId}. Redirecting...`);
      return NextResponse.json({ url: portalSession.url });

    } catch (portalError) {
      console.error(`Portal Session Error: Error creating Stripe Portal session for customer ${customerId}:`, portalError);
      return new NextResponse('Internal Server Error creating portal session', { status: 500 });
    }

  } catch (error) {
    console.error('Unexpected error in /api/stripe/create-portal-session:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}