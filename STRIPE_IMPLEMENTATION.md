# Stripe Subscription Implementation Checklist

This document outlines the steps required to implement a Stripe subscription paywall for specific features (Safer Alternatives, Community Opinions) in the TrustPlace v3 safety report page.

**Goal:** Replace the basic authentication check with a check for an active Stripe subscription.

## 0. Environment Variables

Ensure the following environment variables are set up correctly in your `.env.local` (for local development) and your deployment environment (e.g., Vercel, Supabase Secrets):

-   `STRIPE_SECRET_KEY`: Your Stripe secret API key.
-   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable API key.
-   `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook signing secret.
-   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
-   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for backend operations).
-   `NEXT_PUBLIC_BASE_URL`: The base URL of your application (e.g., `http://localhost:3000` or your production domain).
-   `YOUR_STRIPE_PRICE_ID`: The ID of the Stripe Price object for your subscription.

## 1. Backend Setup (Supabase & Stripe)

-   [ ] **Stripe Account:**
    -   [ ] Create a Stripe account (if you don't have one).
    -   [ ] Find your API Keys (Secret and Publishable) in the Stripe Dashboard.
    -   [ ] Create a Product in Stripe (e.g., "TrustPlace Premium Features").
    -   [ ] Add a Price to the Product (e.g., $4.99/month, recurring). Note the Price ID (e.g., `price_123...`).
    -   [ ] Set up a Webhook endpoint in Stripe Dashboard pointing to your deployment's `/api/stripe/webhooks` route. Select the events to listen for:
        -   `checkout.session.completed`
        -   `customer.subscription.updated`
        -   `customer.subscription.deleted`
    -   [ ] Note the Webhook Signing Secret.

-   [ ] **Supabase Setup:**
    -   [ ] Add Stripe API Secret Key and Webhook Signing Secret to your Supabase project's secrets (or `.env` file for local development).
    -   [ ] Create/Update a `profiles` table in Supabase:
        -   `id` (UUID, Primary Key, Foreign Key to `auth.users.id`, set up cascade delete)
        -   `stripe_customer_id` (TEXT, nullable, unique)
        -   `stripe_subscription_id` (TEXT, nullable, unique)
        -   `stripe_price_id` (TEXT, nullable)
        -   `stripe_current_period_end` (TIMESTAMPTZ, nullable)
        -   `subscription_status` (TEXT, nullable - e.g., 'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')
        -   (Optional: Add other user profile fields as needed: `email`, `full_name` etc.)
    -   [ ] Set up Row Level Security (RLS) policies on the `profiles` table (e.g., users can only view/update their own profile).
    -   [ ] **Implement** a database function or trigger to automatically create a profile entry when a new user signs up in `auth.users`. This ensures a profile exists when needed for Stripe operations.

## 2. Backend API Endpoints (Next.js API Routes)

-   [ ] **`POST /api/stripe/create-checkout-session`:**
    -   [ ] Protect route: Ensure only authenticated users can call it.
    -   [ ] Get Supabase user ID from the session.
    -   [ ] Retrieve (or create) the user's `stripe_customer_id`:
        -   Query `profiles` table for the user's `stripe_customer_id`.
        -   If it doesn't exist, create a new Stripe Customer using the Stripe Node library (`stripe.customers.create`), passing user's email.
        -   Store the new `stripe_customer_id` in the user's `profiles` record.
    -   [ ] Create a Stripe Checkout Session (`stripe.checkout.sessions.create`):
        -   `customer`: The user's `stripe_customer_id`.
        -   `payment_method_types`: `['card']`.
        -   `line_items`: `[{ price: 'YOUR_STRIPE_PRICE_ID', quantity: 1 }]`.
        -   `mode`: `'subscription'`.
        -   `allow_promotion_codes`: `true` (optional).
        -   `success_url`: URL to redirect to after successful payment (e.g., `${process.env.NEXT_PUBLIC_BASE_URL}/safety-report/[id]?session_id={CHECKOUT_SESSION_ID}`).
        -   `cancel_url`: URL to redirect to if the user cancels (e.g., `${process.env.NEXT_PUBLIC_BASE_URL}/safety-report/[id]`).
        -   `metadata`: `{ supabase_user_id: user.id }` (important for webhook).
    -   [ ] Return the `url` from the created Checkout Session to the frontend.

-   [ ] **`POST /api/stripe/webhooks`:**
    -   [ ] Use `micro` or Next.js body parser config to get the raw request body.
    -   [ ] Verify the Stripe signature using the `stripe.webhooks.constructEvent` method and your Webhook Signing Secret.
    -   [ ] Handle relevant Stripe events:
        -   **`checkout.session.completed`:**
            -   Retrieve the full session object (`event.data.object`).
            -   Get the `supabase_user_id` from `session.metadata`.
            -   Get the `stripe_customer_id` and `stripe_subscription_id` from the session.
            -   Update the corresponding user's `profiles` record with `stripe_customer_id` and `stripe_subscription_id`. **Note:** While this event confirms checkout, rely on `customer.subscription.updated` or `customer.subscription.created` (often triggered immediately after) for the definitive `subscription_status` ('active') and `stripe_current_period_end`.
        -   **`customer.subscription.updated`:**
            -   Retrieve the subscription object (`event.data.object`).
            -   Get the `stripe_customer_id`.
            -   Find the user via `stripe_customer_id` in your `profiles` table.
            -   Update `subscription_status`, `stripe_price_id`, `stripe_current_period_end` in the user's profile based on the subscription data.
        -   **`customer.subscription.deleted`:**
            -   Retrieve the subscription object (`event.data.object`).
            -   Find the user via `stripe_customer_id`.
            -   Update `subscription_status` to 'canceled' or null in the user's profile.
    -   [ ] Return `200 OK` to Stripe for successfully handled events.

## 3. Frontend Implementation

-   [ ] **Subscription Status Management:**
    -   [ ] Modify `useAuth` or `useSupabase` provider (or create a dedicated hook `useSubscription`) to fetch the user's subscription status (`subscription_status`, `stripe_price_id` etc.) from their `profiles` record along with their auth state.
    -   [ ] Make this status available globally via context.

-   [ ] **`PaidContentGuard` Component (`src/app/components/billing/PaidContentGuard.tsx`):**
    -   [ ] Create the component accepting `children`.
    -   [ ] Use the `useAuth`/`useSupabase`/`useSubscription` hook to get the user's auth state and subscription status.
    -   [ ] **Logic:**
        -   If loading auth/subscription status, show a loading skeleton.
        -   If user is authenticated AND has an `active` subscription status, render `{children}`.
        -   If user is authenticated BUT does NOT have an active subscription:
            -   Render a blurred version of `{children}` (similar to `RestrictedContent`).
            -   Render an overlay prompt: "Unlock for $4.99 USD/month".
            -   Include a "Subscribe" button.
        -   If user is NOT authenticated:
            -   Render a blurred version of `{children}`.
            -   Render an overlay prompt: "Sign in to Subscribe".
            -   Include "Sign In" / "Sign Up" buttons (linking to auth pages with `next` param).
    -   [ ] **\"Subscribe\" Button Handler:**
        -   Function `handleSubscribeClick`.
        -   Set a loading state for the button.
        -   Call the `POST /api/stripe/create-checkout-session` endpoint.
        -   On success, get the Stripe Checkout URL and redirect the user: `window.location.href = checkoutUrl;`.
        -   On error, show an error message (e.g., using a toast notification).
        -   Reset button loading state.

-   [ ] **Update `src/app/safety-report/[id]/page.tsx`:**
    -   [ ] Import `PaidContentGuard`.
    -   [ ] Wrap the content within the `'alternatives'` case's `div.bg-gray-50` with `<PaidContentGuard>`.
    -   [ ] Wrap the `<CommunityOpinions ... />` component within the `'safety'` case with `<PaidContentGuard>`.
    -   [ ] Ensure `SafetyMetrics` remains *outside* any guard.

-   [ ] **Stripe Publishable Key:**
    -   [ ] Add your Stripe Publishable Key to your frontend environment variables (`.env.local` or Vercel env vars) as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## 4. Customer Portal (Optional but Recommended)

-   [ ] **Backend `POST /api/stripe/create-portal-session`:**
    -   [ ] Protect route (authenticated users).
    -   [ ] Get user ID and their `stripe_customer_id`.
    -   [ ] Create a Stripe Billing Portal session (`stripe.billingPortal.sessions.create`):
        -   `customer`: `stripe_customer_id`.
        -   `return_url`: Where to redirect after portal use.
    -   [ ] Return the portal session `url`.
-   [ ] **Frontend:**
    -   [ ] Add a "Manage Subscription" button (e.g., in user account settings or near paywalled content for subscribed users).
    -   [ ] Button calls `/api/stripe/create-portal-session` and redirects the user to the returned URL.

## 5. Testing

-   [ ] Test the entire flow in Stripe Test Mode.
-   [ ] Use Stripe's test card numbers.
-   [ ] Test webhook handling locally (e.g., using Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhooks`).
-   [ ] Test subscribed user state.
-   [ ] Test unsubscribed user state.
-   [ ] Test non-authenticated user state.
-   [ ] Test subscription cancellation via Customer Portal and webhook updates.
-   [ ] **Implement and Test Robust Error Handling:** Ensure user-friendly feedback (e.g., toasts) for frontend API call failures and proper logging for backend errors (especially in webhooks).
