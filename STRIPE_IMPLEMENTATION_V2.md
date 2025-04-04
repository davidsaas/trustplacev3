<<<<<<< HEAD
# Stripe Subscription Implementation Plan (V2)

Thiss plan outlines the steps required to implement a Stripe subscription paywall in the TrustPlace v3 application, focusing on preventing re-rendering loop issues by centralizing subscription state management and refactoring data fetching logic.

**Core Strategy:**

1.  Enhance `AuthProvider` to fetch and provide both Supabase user data and associated `profiles` data (including Stripe subscription status) globally.
2.  Refactor data fetching in components (like `SafetyReportPage`) to use Server Actions or dedicated API routes, removing direct server-client usage from `useEffect`.
3.  Implement standard Stripe backend components (Checkout Session API, Webhook Handler, optional Portal API).
4.  Use a `PaidContentGuard` component that relies on the enhanced `AuthProvider` for access control.

---

## Phase 1: Enhance Authentication & Subscription Context

1.  **Modify `AuthProvider` (`src/components/shared/providers/auth-provider.tsx`):**
    *   **Goal:** Fetch and provide both the `User` object *and* their corresponding `profiles` record (including subscription status) through the `useAuth` hook.
    *   **Steps:**
        *   Define a `Profile` type based on the `public.profiles` table columns (including `id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `stripe_current_period_end`, `subscription_status`).
        *   Add state: `const [profile, setProfile] = useState<Profile | null>(null);`
        *   In the main `useEffect` (handling `onAuthStateChange` and `getSession`):
            *   After `setUser(currentUser)` successfully sets a non-null user:
                *   Query Supabase: `const { data: profileData, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();`
                *   If `profileData` exists, `setProfile(profileData)`.
                *   If `error` or no data, `setProfile(null)` and log appropriately.
                *   Ensure this fetch happens only when `currentUser.id` changes or becomes available.
            *   When the user logs out (`session` is null), set `setProfile(null)`.
        *   Update `AuthContextType` to include `profile: Profile | null`.
        *   Add `profile` to the `value` object provided by the context.
    *   **Benefit:** Centralizes subscription status fetching, making it available globally via `useAuth().profile?.subscription_status` without requiring components to fetch it individually, thus preventing a major source of potential re-renders.

---

## Phase 2: Backend Setup (API Routes & Webhooks)

1.  **Environment Variables (`.env`):**
    *   Ensure the following are set:
        *   `STRIPE_SECRET_KEY`
        *   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
        *   `STRIPE_WEBHOOK_SECRET`
        *   `NEXT_PUBLIC_SUPABASE_URL`
        *   `SUPABASE_SERVICE_ROLE_KEY`
        *   `NEXT_PUBLIC_BASE_URL`
        *   `YOUR_STRIPE_PRICE_ID` (Replace with actual Price ID)

2.  **Stripe Configuration:**
    *   In Stripe Dashboard:
        *   Create a Product (e.g., "TrustPlace Premium").
        *   Create a recurring Price for the Product. Note the Price ID (`price_...`).
        *   Configure a Webhook endpoint:
            *   URL: `[YOUR_DEPLOYMENT_URL]/api/stripe/webhooks`
            *   Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
            *   Note the Webhook Signing Secret (`whsec_...`).

3.  **Create API Route: `POST /api/stripe/create-checkout-session`**
    *   **File:** `src/app/api/stripe/create-checkout-session/route.ts`
    *   **Logic:**
        *   Use Next.js App Router Route Handler (`export async function POST(request: Request) { ... }`).
        *   Initialize Supabase client for route handlers: `const supabase = createRouteHandlerClient({ cookies });`.
        *   Get user session: `const { data: { user } } = await supabase.auth.getUser();`. If no user, return `new Response('Unauthorized', { status: 401 });`.
        *   Fetch user's profile: `const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();`. Handle errors.
        *   Initialize Stripe: `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);`.
        *   Get or create Stripe Customer ID:
            *   `let customerId = profile?.stripe_customer_id;`
            *   `if (!customerId) { ... create stripe.customers.create({ email: user.email }); customerId = newCustomer.id; await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id); ... }`
        *   Create Stripe Checkout Session: `const session = await stripe.checkout.sessions.create({ ... });`
            *   `customer`: `customerId`.
            *   `line_items`: `[{ price: process.env.YOUR_STRIPE_PRICE_ID, quantity: 1 }]`.
            *   `mode`: `'subscription'`.
            *   `success_url`: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`.
            *   `cancel_url`: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/cancel`.
            *   `metadata`: `{ supabase_user_id: user.id }`.
        *   Return session URL: `return new Response(JSON.stringify({ url: session.url }), { status: 200 });`. Handle errors appropriately.

4.  **Create API Route: `POST /api/stripe/webhooks`**
    *   **File:** `src/app/api/stripe/webhooks/route.ts`
    *   **Logic:**
        *   Use Route Handler structure.
        *   Get raw body: `const rawBody = await request.text();`.
        *   Get signature: `const signature = request.headers.get('stripe-signature');`.
        *   Initialize Stripe.
        *   Verify signature: `let event; try { event = stripe.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET!); } catch (err) { ... return new Response('Webhook Error', { status: 400 }); }`.
        *   Initialize Supabase Admin Client: `const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);`.
        *   Handle events (`switch (event.type)`):
            *   **`checkout.session.completed`:** Get session, extract `supabase_user_id`, `customer`, `subscription`. Update `profiles` table for `supabase_user_id` with `stripe_customer_id` and `stripe_subscription_id`.
            *   **`customer.subscription.updated`:** Get subscription, extract `customer`, `status`, `current_period_end`, `items.data[0].price.id`. Find profile by `stripe_customer_id`. Update `profiles` with `subscription_status`, `stripe_current_period_end`, `stripe_price_id`.
            *   **`customer.subscription.deleted`:** Get subscription, extract `customer`. Find profile by `stripe_customer_id`. Update `profiles`: set `subscription_status`='canceled', clear Stripe fields.
        *   Return `new Response(JSON.stringify({ received: true }), { status: 200 });`. Handle database update errors (return 500).

5.  **Create API Route: `POST /api/stripe/create-portal-session` (Optional)**
    *   **File:** `src/app/api/stripe/create-portal-session/route.ts`
    *   **Logic:** Similar to checkout route.
        *   Protect route, get user session.
        *   Fetch profile, get `stripe_customer_id`. Error if missing.
        *   Create Stripe Billing Portal session: `const portalSession = await stripe.billingPortal.sessions.create({ customer: stripe_customer_id, return_url: ... });`.
        *   Return `portalSession.url`.

---

## Phase 3: Frontend Implementation & Refactoring

1.  **Create `PaidContentGuard` Component:**
    *   **File:** `src/app/components/billing/PaidContentGuard.tsx`
    *   **Logic:**
        *   `const { user, profile, loading } = useAuth();`
        *   If `loading`, show spinner.
        *   If `!user`, show "Sign in" prompt, blur children.
        *   If `user &amp;&amp; profile?.subscription_status !== 'active'`, show "Subscribe" prompt, blur children. Add "Subscribe" button.
        *   If `user &amp;&amp; profile?.subscription_status === 'active'`, render `{children}`. Optionally add "Manage Subscription" button.
        *   **"Subscribe" Handler:** `fetch('/api/stripe/create-checkout-session', { method: 'POST' })`, handle response, redirect to `url`.
        *   **"Manage Subscription" Handler:** `fetch('/api/stripe/create-portal-session', { method: 'POST' })`, handle response, redirect to `url`.

2.  **Refactor `SafetyReportPage` (`src/app/safety-report/[id]/page.tsx`):**
    *   **Goal:** Clean separation of concerns, prevent client-side server logic execution.
    *   **Steps:**
        *   Remove `import { supabaseServer } ...` and all direct calls using it within the component body or `useEffect`.
        *   **Refactor Data Fetching (Choose one):**
            *   **Server Actions (Preferred):**
                *   Define `async function getReportDataAction(...)`, `async function findSimilarAccommodationsAction(...)` etc., potentially in separate `src/app/safety-report/actions.ts`. Mark with `'use server'`.
                *   These actions use `createServerActionClient` or `createServerComponentClient` (if called from Server Component parts) or Supabase Admin client to fetch data.
                *   Call these actions from `SafetyReportPage` (e.g., `useEffect(async () => { const data = await getReportDataAction(params.id); setData(data); }, [params.id]);`).
            *   **API Routes:**
                *   Create routes like `/api/safety-report/[id]/details`.
                *   Implement fetching logic within these routes using `createRouteHandlerClient`.
                *   Call these routes from `SafetyReportPage` using `fetch` within `useEffect`.
        *   **Simplify `useEffect`:** Ensure effects primarily depend on stable identifiers like `params.id`. Use `useAuth().profile` directly for subscription checks, not as an effect dependency for fetching profile data again.
        *   **Integrate `PaidContentGuard`:** Wrap relevant JSX sections (e.g., Safer Alternatives, Community Opinions) with `<PaidContentGuard>...</PaidContentGuard>`.

3.  **Create Payment Status Pages (Optional):**
    *   `src/app/payment/success/page.tsx`
    *   `src/app/payment/cancel/page.tsx`

---

## Phase 4: Testing

1.  **Local Webhook Testing:** Use `stripe listen --forward-to http://localhost:3000/api/stripe/webhooks`.
2.  **Test Cases:**
    *   Unauthenticated flow.
    *   Authenticated, non-subscribed flow (paywall visible).
    *   Subscription purchase flow (Checkout -> Success -> Webhooks -> Profile Update -> Content Visible).
    *   Authenticated, subscribed flow (content visible directly).
    *   Cancellation flow (Portal -> Webhooks -> Profile Update -> Paywall Visible).
    *   Error handling (payment failures, webhook signature errors, DB errors).
    *   **Re-rendering Loop Verification:** Navigate between pages, log in/out, ensure smooth experience without excessive re-renders, especially on `SafetyReportPage`.

---

## Mermaid Diagram: Core Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend (React Components)
    participant AuthProvider
    participant PaidContentGuard
    participant API (Next.js Routes / Server Actions)
    participant Stripe
    participant Supabase DB

    User->>Frontend: Visits Safety Report Page
    Frontend->>AuthProvider: useAuth()
    AuthProvider-->>Frontend: Returns { user, profile, loading } (Profile includes sub status)
    Frontend->>PaidContentGuard: Renders with content
    PaidContentGuard->>AuthProvider: Reads { user, profile, loading }
    alt User Not Logged In OR Not Subscribed (profile.status != 'active')
        PaidContentGuard-->>Frontend: Shows Paywall Prompt (Sign In / Subscribe)
        User->>PaidContentGuard: Clicks "Subscribe"
        PaidContentGuard->>API: POST /api/stripe/create-checkout-session
        API->>Supabase DB: Get/Update Profile (Stripe Customer ID)
        API->>Stripe: create checkout.session
        Stripe-->>API: Returns session URL
        API-->>PaidContentGuard: Returns { url }
        PaidContentGuard->>User: Redirect to Stripe Checkout (url)
        User->>Stripe: Completes Payment
        Stripe->>API: POST /api/stripe/webhooks (checkout.session.completed)
        API->>Supabase DB: Update Profile (stripe_customer_id, stripe_subscription_id)
        Stripe->>API: POST /api/stripe/webhooks (customer.subscription.updated)
        API->>Supabase DB: Update Profile (status='active', period_end, price_id)
        User->>Frontend: Redirected back to app (e.g., /payment/success)
        Note over Frontend, AuthProvider: Auth state might refresh, AuthProvider fetches updated profile automatically
    else User Logged In AND Subscribed (profile.status == 'active')
        PaidContentGuard-->>Frontend: Renders Children (Protected Content)
    end
=======
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
>>>>>>> e2de52c (back)
