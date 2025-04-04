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