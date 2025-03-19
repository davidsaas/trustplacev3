## 1. Overview

**Trustplace** is a Safety Report web application designed to empower travelers with data-driven insights on the safety of Airbnb/Booking listings. Users submit a listing URL and receive a comprehensive safety report built on pre-ingested data. For the MVP, the initial focus is on Los Angeles (LA) accommodations, with plans to expand later. The platform leverages a lightweight React/TypeScript frontend, Supabase for authentication and database management, and a Python script for analyzing crime data to compute safety metrics.

---

## 2. Problem Statement

Travelers—especially those visiting large cities like LA—face uncertainty when assessing the safety of a listing. There is no dedicated tool that:

- Evaluates listing safety based on localized crime data.
- Aggregates and highlights community opinions from platforms like Reddit and YouTube.
- Compares safety metrics across similar listings.
- Provides actionable insights for informed decision-making.

---

## 3. Target Users

- **Travelers** planning trips to major cities (initially LA).
- **Families** with children or elderly members.
- **Solo travelers**, with an emphasis on women's safety.
- **First-time visitors** who need local safety insights.

---

## 4. User Interface & Feature Requirements

### A. Landing Page

- **Design & Layout:**
    - Modern, clean, and safety-focused design.
    - A hero section with a dynamic headline (rotating keywords), a prominent search bar for listing URLs, and floating safety tags (with Unsplash imagery).
- **SEO Optimization:**
    - Implement SEO best practices (meta tags, schema markup, open graph tags, and fast load times) to ensure high search engine visibility.
- **Features:**
    - **Partner Logos:** Display logos for data sources (e.g., Reddit, TripAdvisor, Airbnb, Booking.com).
    - **Testimonials & Features Overview:** Highlight user testimonials and key functionalities.
    - **Blog & FAQ:** Accessible sections for blog posts and frequently asked questions.
    - **Navigation:** Clear links for sign up/login.

### B. Authentication Pages

- **Design:**
    - Clean, minimalist login and signup screens using Supabase's default UI.
    - "Back to homepage" navigation option..
- **Functionality:**
    - Use lightweight Supabase authentication (email/password and Google).
    - **Content Visibility:** Ensure that when a page requires authentication, content does not flicker or display in an unauthorized state. Protected sections (like safety metrics and community opinions) are rendered only after authentication is confirmed.

### C. Safety Report Dashboard (Web App)

- **Redirection:** Users are routed here after URL submission.
- **Overview Section:**
    - Display essential accommodation details: Name, Image, Price, Location, and Safety Score.
- **Safety Metrics Feature (Authentication Required):**
    - **Data Analysis via Python Script:** A Python script processes raw crime data (from APIs such as [LA Crime Data](https://data.lacity.org/resource/2nrs-mtv8.json)) and performs basic crime mapping.
        - **City-Specific Crime Mapping:** Each city may have different crime coding (e.g., LA uses MO codes). Mapping guides and materials will be stored in a dedicated project folder.
    - **Display:** Five safety metrics (0–100 score with graphical bars):
        - **Nighttime Safety:** "Can I go outside after dark?"
        - **Car Parking Safety:** "Can I park here safely?"
        - **Kids Safety:** "Are kids safe here?"
        - **Transportation Safety:** "Is it safe to use public transport?"
        - **Women's Safety:** "Would I be harassed here?"
    - Based on 0-100 score from all metrics the overall safety score for the accommodation will be calculated
- **Community Opinions & AI Takeaways (Authentication Required):**
    - **Community Opinions:** Fetch and store aggregated opinions from Reddit and YouTube based on the accommodation's geographic location (lat/lng within a set radius).
    - **AI-Generated Takeaways:** Automatically generate summaries for community opinions and YouTube transcripts. *(Note: AI-generated takeaways are applied only to community opinions and video content, not the safety metrics.)*
- **Content Access for Unsigned Users:**
    - For users not signed in, the safety metrics and community opinions sections will appear blurred with a modern, clear call-to-action button prompting users to sign up.
- **Map Integration:**
    - Use Mapbox to display the accommodation's location and mark safer alternatives at similar price points.

---

## 5. Technical Requirements

### A. Frontend

- **Framework:** React with TypeScript.
- **Styling & UI:**
    - Tailwind CSS for a modern, responsive, mobile-first design.
    - Utilize component libraries (e.g., Shadcn UI) to maintain a consistent look and feel.
- **Mapping:** Integration with Mapbox.
- **Deployment:**
    - Configure the project for seamless testing and deployment on Vercel (include `vercel.json` and proper environment variable management).

### B. Backend

- **API Routes:**
    - Use Next.js API routes or an alternative Node/Express backend if preferred.
- **Authentication & Database (Supabase):**
    - **Auth:** Leverage Supabase's default authentication, ensuring smooth content display (without flickering) prior to auth verification.
    - **Database Schema:**
        - **Accommodations:**
            - Fields include unique ID, URL, name, image URL, price, location, safety score, and "last-updated" timestamp.
            - **Scope:** Initial ingestion is for LA accommodations only.
        - **Safety Metrics & AI Takeaways:**
            - Tables for storing safety metrics (populated by the Python script) and AI-generated community takeaways.
        - **Community Opinions:**
            - Store aggregated community opinions keyed by geographic coordinates (lat/lng with a defined radius).
- **Environment Variables:**
    - Secure all API keys in a `.env` file and document setup instructions.

### C. External API Integrations & Python Script

- **Data Providers:**
    - Use official crime data sources (e.g., LA's open data API) for safety metrics.
    - Retrieve community insights from Reddit and YouTube.
- **Python Safety Metrics Script:**
    - **Role:** Exclusively perform data analysis to compute safety metrics based on raw crime data.
    - **Crime Mapping:**
        - Map raw crime codes (city-specific, e.g., LA MO codes) to defined safety metrics.
        - Store mapping guides and supporting materials in a dedicated project folder.
    - **Output:** Insert computed safety metrics into Supabase.
- **Error Handling:**
    - Implement fallback mechanisms and detailed logging for the Python script and API integrations.

---

## 6. Data Handling

- **Initial Data Ingestion (LA Only):**
    - Import an initial set of LA accommodations from Apify into Supabase.
    - At this stage, recurring updates are deferred until the initial workflow is validated.
- **Post-Ingestion Processing:**
    - Run the Python script to analyze crime data and generate safety metrics.
    - Store computed metrics and AI-generated community takeaways (for Reddit and YouTube) in Supabase.
- **Future Recurring Updates:**
    - Later, implement a recurring script to refresh accommodations, safety metrics, and community opinions.

---

## 7. Authentication Flow

1. **User Initiation:**
    - Users click "Sign Up" or "Log In" from the landing page or safety report dashboard.
2. **Supabase Authentication:**
    - Use default Supabase auth (email/password and Google).
    - **Content Loading:** Ensure that protected content (safety metrics and community opinions) remains blurred until the authentication check completes, preventing any flickering of unauthorized content.
3. **Post-Authentication:**
    - Redirect users to their intended destination (e.g., the safety report dashboard).

---

## 8. Future Enhancements

- **Geographic Expansion:**
    - Extend support beyond LA to include other major cities.
- **Recurring Data Updates:**
    - Implement scheduled processes to refresh accommodations, safety metrics, and community opinions.
- **Enhanced AI Features:**
    - Further refine AI-generated summaries and introduce personalized recommendations.
- **Business Model Optimization:**
    - Expand affiliate partnerships and ad networks based on performance analytics.

---

## 11. Design System

### UI/UX Principles for a Consumer Web App

- **User-Centric Simplicity:**
    - Focus on a clean, intuitive design with minimal clutter. Prioritize ease of navigation and immediate access to key functionalities.
- **Consistency & Familiarity:**
    - Maintain a consistent visual language and layout across the application to build user trust.
- **Responsive & Mobile-First:**
    - Design with a mobile-first approach, ensuring optimal performance and usability on all devices.
- **Accessible & Inclusive:**
    - Follow accessibility best practices (e.g., proper color contrast, keyboard navigation, and screen reader compatibility) to accommodate all users.
- **Engaging Onboarding:**
    - For unsigned users, employ modern design techniques (such as blurred content with a prominent, well-designed sign-up prompt) to guide them toward registration seamlessly.
- **Performance & Feedback:**
    - Ensure fast load times, smooth transitions, and immediate visual feedback for user interactions.
- **SEO & Discoverability:**
    - Integrate SEO best practices to improve search engine visibility without compromising design aesthetics.


## 12. API JSONS for initial setup:

- Apify reddit comments for LA:
    - https://api.apify.com/v2/datasets/AGSbyFCJDEwnNj3Iq/items?clean=true&format=json
- Apify airbnb accommodations for LA:
    - https://api.apify.com/v2/datasets/ahO69GU8VMAQiO3cu/items?clean=true&format=json
- Apify booking accommodations for LA:
    - https://api.apify.com/v2/datasets/f0zLgeObIt04pjSn4/items?clean=true&format=json
- LA official crime data:
    - https://data.lacity.org/resource/2nrs-mtv8.json

## 13. Implementation Roadmap & Progress

### Phase 1: Project Setup and Core Infrastructure ✅
1. ✅ Initialize Next.js project with TypeScript
2. ✅ Set up TailwindCSS and Shadcn UI
3. ✅ Configure project structure
4. ✅ Set up environment variables
5. ✅ Implement basic SEO configuration
6. ✅ Create base layout components

### Phase 2: Landing Page and Authentication (Completed)
1. ✅ Develop landing page components
   - ✅ Hero section with search
   - ✅ Feature highlights
   - ✅ Partner logos
   - ✅ Testimonials
2. ✅ Create authentication pages
   - ✅ Login/Signup UI
   - ✅ Supabase authentication integration
   - ✅ Protected routes
   - ✅ Authentication state management
   - ✅ Navigation with auth states

### Phase 3: Safety Report Dashboard
1. Implement accommodation search and URL processing
2. Create safety metrics visualization components
3. Develop map integration with Mapbox
4. Build community opinions section
5. Implement AI-generated takeaways

### Phase 4: Data Processing and Storage (Next Up)
1. Create Python script for crime data processing
2. Set up data ingestion pipeline
   - Airbnb/Booking.com data from Apify
   - Reddit comments processing
   - LA crime data processing
3. Design and implement Supabase database schema
4. Create API endpoints for data retrieval


### Phase 5: Testing and Optimization
1. Implement comprehensive testing
2. Performance optimization
3. Mobile responsiveness
4. Accessibility improvements
5. SEO optimization
6. Security audit

### Phase 6: Deployment and Launch Preparation
1. Set up Vercel deployment
2. Configure production environment
3. Final testing and bug fixes
4. Documentation
5. Launch preparation

### Current Status: Phase 2 (Authentication & CMS Integration)
Next immediate tasks:
1. Complete Supabase authentication integration
2. Set up Strapi content types and API
3. Connect landing page to Strapi CMS
4. Implement authentication state management