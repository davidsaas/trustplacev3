import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@supabase/supabase-js'; // Use standard client with service role
import type { Database } from '@/lib/supabase/database.types';

// Use standard Supabase client with Service Role Key for webhook updates
// Note: We don't use @supabase/ssr here as there's no user session/cookies involved directly in the webhook request itself.
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  // Add 'invoice.paid' or 'invoice.payment_failed' if needed for more granular status updates
]);

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  throw new Error('Missing environment variable: STRIPE_WEBHOOK_SECRET');
}

export async function POST(req: Request) {
  const body = await req.text(); // Need raw body for signature verification
  const signature = headers().get('stripe-signature');

  if (!signature) {
    console.error('Webhook Error: Missing stripe-signature header');
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }
  
  // --- Helper Function for Signature Verification ---
  async function verifyStripeSignature(body: string, signature: string): Promise<Stripe.Event> {
    // WEBHOOK_SECRET is checked globally above, so it's guaranteed to exist here
    if (!WEBHOOK_SECRET) {
      throw new Error('Webhook secret is not configured.'); // Should not happen
    }
    try {
      const event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
      return event;
    } catch (err: any) {
      console.error(`Webhook signature verification failed inside helper: ${err.message}`);
      // Re-throw a specific error type or the original error
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }
  }
  // --- End Helper Function ---

  // --- 1. Verify Webhook Signature using Helper ---
  let event: Stripe.Event;
  try {
    // Pass the signature (known to be a string here) to the helper
    event = await verifyStripeSignature(body, signature);
    console.log(`Webhook verified via helper: ${event.type} (ID: ${event.id})`);
  } catch (err: any) {
    // Error already logged in helper, just return response
    return new NextResponse(err.message, { status: 400 });
  }

  // --- 2. Handle Verified Event ---

  // Handle only the relevant events
  try {
    if (relevantEvents.has(event.type)) {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log('Handling checkout.session.completed for session:', session.id);

            // Check if subscription ID exists (it should for subscription mode)
            if (!session.subscription || !session.customer || !session.metadata?.supabase_user_id) {
               console.error('Webhook Error (checkout.session.completed): Missing required data (subscription, customer, or supabase_user_id metadata). Session:', session);
               // Return 200 to Stripe to acknowledge receipt, but log the error
               return new NextResponse('Webhook Error: Missing required data', { status: 200 });
            }

            const supabaseUserId = session.metadata.supabase_user_id;
            const stripeSubscriptionId = session.subscription as string;
            const stripeCustomerId = session.customer as string;

            // Update profile with IDs - status/period end handled by subscription.updated
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({
                stripe_subscription_id: stripeSubscriptionId,
                stripe_customer_id: stripeCustomerId, // Ensure customer ID is stored if not already
              })
              .eq('id', supabaseUserId);

            if (error) {
              console.error(`Webhook DB Error (checkout.session.completed): Failed to update profile for user ${supabaseUserId}. Error:`, error);
              // Don't throw, let Stripe retry if needed, but log it
            } else {
               console.log(`Webhook DB Success (checkout.session.completed): Updated profile for user ${supabaseUserId} with sub ID ${stripeSubscriptionId}`);
            }
            break;
          }

          case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            console.log('Handling customer.subscription.updated for subscription:', subscription.id);

            const stripeCustomerId = subscription.customer as string;
            const stripeSubscriptionId = subscription.id;
            const stripePriceId = subscription.items.data[0]?.price.id;
            // Explicitly check for property existence and type, avoiding direct reliance on potentially incomplete TS types
            let currentPeriodEndTimestamp: number | undefined;
            // Use 'subscription' directly here as event.data.object is already cast
            if (subscription && 'current_period_end' in subscription && typeof subscription.current_period_end === 'number') {
               currentPeriodEndTimestamp = subscription.current_period_end;
            }

            if (currentPeriodEndTimestamp === undefined) {
              console.error(`Webhook Error (customer.subscription.updated): Missing or invalid 'current_period_end' property on subscription object for subscription ${subscription.id}`);
              return new NextResponse('Webhook Error: Invalid subscription data object', { status: 200 }); // Acknowledge receipt but log error
            }
            const stripeCurrentPeriodEnd = new Date(currentPeriodEndTimestamp * 1000); // Convert Unix timestamp
            const subscriptionStatus = subscription.status;

            // Find user by Stripe Customer ID
            const { data: profile, error: profileError } = await supabaseAdmin
              .from('profiles')
              .select('id') // Select only id, or other fields if needed
              .eq('stripe_customer_id', stripeCustomerId)
              .single();

            if (profileError || !profile) {
               console.error(`Webhook Error (customer.subscription.updated): Profile not found for Stripe Customer ID ${stripeCustomerId}. Error:`, profileError);
               // Return 200 to Stripe, can't update if profile doesn't exist
               return new NextResponse('Webhook Error: Profile not found', { status: 200 });
            }

            const supabaseUserId = profile.id;

            // Update profile with latest subscription details
            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update({
                stripe_subscription_id: stripeSubscriptionId,
                stripe_price_id: stripePriceId,
                // Ensure stripeCurrentPeriodEnd is valid before calling toISOString()
                stripe_current_period_end: stripeCurrentPeriodEnd instanceof Date && !isNaN(stripeCurrentPeriodEnd.getTime())
                  ? stripeCurrentPeriodEnd.toISOString()
                  : null,
                subscription_status: subscriptionStatus,
              })
              .eq('id', supabaseUserId);

            if (updateError) {
              console.error(`Webhook DB Error (customer.subscription.updated): Failed to update profile for user ${supabaseUserId}. Error:`, updateError);
            } else {
               console.log(`Webhook DB Success (customer.subscription.updated): Updated profile for user ${supabaseUserId} with status ${subscriptionStatus}`);
            }
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
             console.log('Handling customer.subscription.deleted for subscription:', subscription.id);

            const stripeCustomerId = subscription.customer as string;

             // Find user by Stripe Customer ID
            const { data: profile, error: profileError } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('stripe_customer_id', stripeCustomerId)
              .single();

            if (profileError || !profile) {
               console.error(`Webhook Error (customer.subscription.deleted): Profile not found for Stripe Customer ID ${stripeCustomerId}. Error:`, profileError);
               return new NextResponse('Webhook Error: Profile not found', { status: 200 });
            }

            const supabaseUserId = profile.id;

            // Update profile: Clear subscription details or set status to 'canceled'
            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update({
                stripe_subscription_id: null,
                stripe_price_id: null,
                stripe_current_period_end: null,
                subscription_status: 'canceled', // Or set to null depending on preference
              })
              .eq('id', supabaseUserId);

             if (updateError) {
              console.error(`Webhook DB Error (customer.subscription.deleted): Failed to update profile for user ${supabaseUserId}. Error:`, updateError);
            } else {
               console.log(`Webhook DB Success (customer.subscription.deleted): Marked subscription as canceled for user ${supabaseUserId}`);
            }
            break;
          }
          default:
            console.warn(`Unhandled relevant event type: ${event.type}`);
        }
    } else {
       console.log(`Webhook received irrelevant event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Return 500 but maybe log more details
    return new NextResponse('Webhook handler error', { status: 500 });
  }

  // Return 200 OK to Stripe to acknowledge receipt of the event
  return new NextResponse('Webhook received', { status: 200 });
}

// No config export needed for App Router Route Handlers
// Body parsing is handled by how you read the request (e.g., req.text())