import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js'; // Use standard client for service role
import type { Database } from '@/lib/supabase/database.types';

// Initialize Stripe (ensure STRIPE_SECRET_KEY is in your .env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Match the version used elsewhere
  typescript: true,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Initialize Supabase Admin Client (requires service_role key)
// Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in .env
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to update profile based on Stripe Customer ID
const updateProfileByCustomerId = async (customerId: string, dataToUpdate: Partial<Database['public']['Tables']['profiles']['Update']>) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(dataToUpdate)
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error(`Webhook Error: Failed to update profile for customer ${customerId}`, error);
    throw new Error(`Webhook database update failed for customer ${customerId}: ${error.message}`);
  }
  console.log(`Webhook: Successfully updated profile for customer ${customerId}`);
};

// Helper function to update profile based on Supabase User ID
const updateProfileByUserId = async (userId: string, dataToUpdate: Partial<Database['public']['Tables']['profiles']['Update']>) => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update(dataToUpdate)
      .eq('id', userId); // Use 'id' which is the Supabase user UUID

    if (error) {
      console.error(`Webhook Error: Failed to update profile for user ${userId}`, error);
      throw new Error(`Webhook database update failed for user ${userId}: ${error.message}`);
    }
    console.log(`Webhook: Successfully updated profile for user ${userId}`);
  };


export async function POST(request: Request) {
  if (!webhookSecret) {
    console.error('Webhook Error: STRIPE_WEBHOOK_SECRET is not set.');
    return new NextResponse('Webhook Error: Missing configuration', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    console.error('Webhook Error: Missing stripe-signature header.');
    return new NextResponse('Webhook Error: Missing signature', { status: 400 });
  }

  let event: Stripe.Event;
  let rawBody: string;

  try {
    rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log(`Webhook Received: ${event.type}, ID: ${event.id}`);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // --- Handle Specific Events ---
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Handling checkout.session.completed');

        // Metadata should contain supabase_user_id if set during session creation
        const userId = session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (!userId) {
          console.error(`Webhook Error (checkout.session.completed): Missing supabase_user_id in session metadata. Session ID: ${session.id}`);
          // Optionally, try to find user via customerId if profile update failed during checkout
          // but relying on metadata is safer.
          return new NextResponse('Webhook Error: Missing user identifier', { status: 400 });
        }
        if (!customerId || !subscriptionId) {
            console.error(`Webhook Error (checkout.session.completed): Missing customer or subscription ID. Session ID: ${session.id}`);
            return new NextResponse('Webhook Error: Missing Stripe IDs', { status: 400 });
        }

        console.log(`Webhook (checkout.session.completed): Updating profile for User: ${userId}, Customer: ${customerId}, Subscription: ${subscriptionId}`);
        await updateProfileByUserId(userId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          // Note: subscription status is usually handled by customer.subscription.updated
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Handling customer.subscription.updated');

        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const subscriptionId = subscription.id;
        const status = subscription.status; // e.g., 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
        const priceId = subscription.items.data[0]?.price.id;
        // Workaround for potential TS type issue: Cast to any to access current_period_end
        const periodEndTimestamp = (subscription as any).current_period_end;
        const currentPeriodEnd = periodEndTimestamp ? new Date(periodEndTimestamp * 1000).toISOString() : null;

        if (!customerId) {
            console.error(`Webhook Error (customer.subscription.updated): Missing customer ID. Subscription ID: ${subscriptionId}`);
            return new NextResponse('Webhook Error: Missing customer identifier', { status: 400 });
        }

        console.log(`Webhook (customer.subscription.updated): Updating profile for Customer: ${customerId}, Subscription: ${subscriptionId}, Status: ${status}`);
        await updateProfileByCustomerId(customerId, {
          stripe_subscription_id: subscriptionId,
          subscription_status: status, // Update with the latest status from Stripe
          stripe_price_id: priceId,
          stripe_current_period_end: currentPeriodEnd,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Handling customer.subscription.deleted');

        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const subscriptionId = subscription.id;

        if (!customerId) {
            console.error(`Webhook Error (customer.subscription.deleted): Missing customer ID. Subscription ID: ${subscriptionId}`);
            return new NextResponse('Webhook Error: Missing customer identifier', { status: 400 });
        }

        console.log(`Webhook (customer.subscription.deleted): Canceling subscription for Customer: ${customerId}, Subscription: ${subscriptionId}`);
        // Set status to 'canceled' or nullify fields as appropriate
        await updateProfileByCustomerId(customerId, {
          subscription_status: 'canceled', // Or map to your specific 'inactive' status
          stripe_subscription_id: null,
          stripe_price_id: null,
          stripe_current_period_end: null,
        });
        break;
      }

      default:
        console.log(`Webhook Received: Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    return NextResponse.json({ received: true });

  } catch (dbError: any) {
    // Error occurred during database update
    console.error(`Webhook database processing error for event ${event.id}:`, dbError);
    return new NextResponse(`Webhook Database Error: ${dbError.message}`, { status: 500 });
  }
}