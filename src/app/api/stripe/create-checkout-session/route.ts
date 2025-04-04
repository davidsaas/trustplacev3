import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Stripe from 'stripe';
import { getURL } from '@/lib/utils/helpers'; // Use the correct helper function name
import type { Database } from '@/lib/supabase/database.types';

// Initialize Stripe (ensure STRIPE_SECRET_KEY is in your .env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Use the expected API version
  typescript: true,
});

const priceId = process.env.YOUR_STRIPE_PRICE_ID; // Ensure this is set in .env

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

  try {
    // 1. Get User Session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Unauthorized: No user session found.');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Fetch User's Profile (including stripe_customer_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    // Handle profile fetch errors (excluding 'not found' which is handled below)
    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = 'Row not found'
      console.error(`Error fetching profile for user ${user.id}:`, profileError);
      return new NextResponse('Internal Server Error fetching profile', { status: 500 });
    }

    // 3. Get or Create Stripe Customer ID
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      console.log(`No Stripe customer ID found for user ${user.id}. Creating new customer...`);
      try {
        const newCustomer = await stripe.customers.create({
          email: user.email,
          // Add metadata if needed, e.g., name
          metadata: {
            supabase_user_id: user.id,
          },
        });
        customerId = newCustomer.id;
        console.log(`Created Stripe customer ${customerId} for user ${user.id}.`);

        // Update Supabase profile with the new customer ID
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Failed to update profile for user ${user.id} with Stripe customer ID ${customerId}:`, updateError);
          // Decide if this is critical enough to stop the checkout process
          return new NextResponse('Failed to update user profile', { status: 500 });
        }
         console.log(`Successfully updated profile for user ${user.id} with Stripe customer ID.`);
      } catch (customerError) {
        console.error(`Error creating Stripe customer or updating profile for user ${user.id}:`, customerError);
        return new NextResponse('Internal Server Error creating customer', { status: 500 });
      }
    } else {
       console.log(`Found existing Stripe customer ID ${customerId} for user ${user.id}.`);
    }

    if (!priceId) {
        console.error('Stripe Price ID (YOUR_STRIPE_PRICE_ID) is not set in environment variables.');
        return new NextResponse('Internal Server Error: Missing configuration', { status: 500 });
    }

    // 4. Create Stripe Checkout Session
    const baseUrl = getURL(); // Use the correct helper function name
    const successUrl = `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/payment/cancel`; // Or redirect to a specific page like /subscribe

    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Add metadata to link session back to Supabase user if needed (webhook already uses customer ID)
        metadata: {
          supabase_user_id: user.id, // Useful for webhook verification/logging
        },
        // Optional: Allow promotion codes
        // allow_promotion_codes: true,
      });

      if (!session.url) {
        console.error('Stripe session created but missing URL.');
        return new NextResponse('Internal Server Error: Failed to create checkout session URL', { status: 500 });
      }

      // 5. Return Session URL
      console.log(`Created Stripe Checkout session ${session.id} for user ${user.id}. Redirecting...`);
      return NextResponse.json({ url: session.url });

    } catch (sessionError) {
      console.error(`Error creating Stripe Checkout session for customer ${customerId}:`, sessionError);
      return new NextResponse('Internal Server Error creating checkout session', { status: 500 });
    }

  } catch (error) {
    console.error('Unexpected error in /api/stripe/create-checkout-session:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}