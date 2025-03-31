# Multi-City Support Enhancement Plan (MVP)

This document outlines the necessary changes to adapt the Trustplace application from an LA-only focus to support multiple cities (e.g., New York, Miami) while maintaining an MVP scope.

## I. Database (Supabase)

*   [ ] **Populate `cities` Table:** Ensure the `cities` table contains necessary data for new cities (NYC, MIA), including `id`, `name`, `state`, `country`, and accurate bounding boxes (`bounds`, `bounds_geom`). Add entries for NYC and Miami.
*   [ ] **Confirm Foreign Keys:** Double-check that `city_id` foreign key constraints exist and are correctly configured on `accommodations`, `safety_metrics`, and `community_opinions` tables, referencing `cities.id`. *(Self-Correction: Initial schema analysis confirms these likely exist, but verification during implementation is recommended).*

## II. Backend Data Processing (Python: `src/lib/safety-metrics/la_safety_processor.py`)

*   [ ] **Rename Script:** Rename `la_safety_processor.py` to something more generic, like `city_safety_processor.py`.
*   [ ] **Parameterize City:** Modify the script (e.g., `main` function) to accept a `city_id` or `city_name` as an argument to process one city at a time.
*   [ ] **City Configuration:** Create a configuration mechanism (e.g., separate JSON files per city `config/nyc.json`, `config/mia.json`, `config/la.json` or fetch from a new `city_configurations` DB table) to store city-specific settings:
    *   [ ] **Identify & Add NYC/MIA Crime Data Source:** Find the appropriate crime data API endpoints/URLs for NYC and Miami.
    *   Crime data API endpoint/source URL.
    *   Crime code mapping rules/logic definition (e.g., path to a mapping file or the mapping itself).
    *   Census/geographic data sources or specific parameters (if they differ).
    *   Relevant bounding boxes or geographic parameters (can also be sourced from `cities.bounds_geom`).
    *   Potentially different thresholds or weights for metric calculations if needed per city.
*   [ ] **Refactor `fetch_crime_data`:** Update to use the city-specific data source URL loaded from the configuration based on the input city parameter.
*   [ ] **Refactor `process_crime_data`:** Abstract or modify the crime code mapping logic to use the city-specific rules loaded from the configuration.
*   [ ] **Refactor Geographic Functions:** Generalize functions like `find_census_blocks_batch_rpc` if they rely on LA-specific geographic services or assumptions. Use `bounds_geom` from the `cities` table where appropriate for boundary checks.
*   [ ] **Update `upload_metrics`:** Ensure the correct `city_id` (passed as a parameter or derived from config) is included when inserting/updating `safety_metrics`.
*   [ ] **Update `update_accommodation_safety_scores`:**
    *   Fetch `safety_metrics` filtered by the target `city_id`.
    *   Fetch `accommodations` filtered by the target `city_id`.
    *   Ensure score updates are correctly associated with accommodations in the specific city being processed.
*   [ ] **Logging:** Enhance logging to clearly indicate which city is being processed in each run.
*   [ ] **Environment/Execution:** Update any deployment scripts or run commands (e.g., in `package.json` or CI/CD) to execute this Python script separately for each supported city.
*   [ ] **Choose & Implement Config Storage:** Decide on the storage method (JSON files recommended for MVP) and implement the loading logic.

## III. Backend Data Ingestion (Node.js: `src/scripts/ingest-reddit-opinions.ts`)

*   [ ] **Parameterize City:** Modify the script (e.g., `ingestData` function or command-line arguments) to accept a `city_id` or `city_name` and load corresponding configuration.
*   [ ] **City Configuration:** Use or extend the city configuration mechanism (see Python section) to store:
    *   [ ] **Identify & Add NYC/MIA Apify URLs:** Find or create the Apify dataset URLs for Reddit/Accommodation data relevant to NYC and Miami.
    *   Apify dataset URLs (or other data sources) for Reddit opinions per city.
    *   Mapbox geocoding parameters: `bbox`, `proximity`.
    *   Acceptable context place names (e.g., `ACCEPTABLE_NYC_PLACES_LOWER`).
    *   Geocoding query construction rules/hints (e.g., append ", NY" instead of ", CA").
*   [ ] **Refactor `geocodeRedditItem`:**
    *   Remove hardcoded LA values (`LA_BBOX`, `LA_PROXIMITY`, `DEFAULT_LA_CITY_ID`, `ACCEPTABLE_LA_CONTEXT_PLACES_LOWER`).
    *   Use city-specific parameters loaded from the configuration based on the input city.
    *   Generalize context filtering logic (`isInAcceptableContext`, `foundRegionCA`) based on city configuration (e.g., check for 'new york' or 'ny' state).
    *   Pass the correct `city_id` (from input/config) when preparing data for insertion into `opinionsToInsert`.
*   [ ] **Update Data Fetching:** Modify the script to use the city-specific Apify URL (or other data source) from the configuration.
*   [ ] **Database Insertion:** Ensure the correct `city_id` is included in the `opinionsToInsert` objects before calling `supabase.from('community_opinions').upsert()`.
*   [ ] **Logging:** Enhance logging for city context during ingestion.
*   [ ] **Environment/Execution:** Update run commands to execute this script separately for each supported city.
*   [ ] **Choose & Implement Config Storage:** Align with the decision made for the Python script (JSON files recommended for MVP) and implement loading logic.

## IV. Backend API (Next.js)

*   [ ] **Refactor `/api/process-url`:**
    *   When looking up an accommodation by URL (`parsedUrl.source`, `parsedUrl.id`), the Supabase query should **not** initially filter by city. It should find the accommodation based on `source` and `external_id` (or similar unique key).
    *   The query should select the `city_id` along with other necessary data (`id`, `name`, etc.).
    *   The API response (`data.reportId` seems to be the internal `id`) should potentially also include the `city_id` or the frontend should fetch it subsequently using the `reportId`. Let's assume the frontend refetches details including `city_id` in `getReportData`.
    *   Remove or update the LA-specific 404 message ("We only have data for certain accommodations in Los Angeles...") to be more generic or dynamic if possible.
    *   [ ] **Review Error Messages:** Check toast messages and API error responses originating from this endpoint for LA-specific text.
*   [ ] **Review `/api/osm-insights` (Implied):**
    *   Verify this API uses the provided `lat`, `lon` for its queries (e.g., to Overpass API) and doesn't contain hardcoded geographic boundaries related to LA. Its logic should be inherently location-based, not city-restricted.
*   [ ] **Review other APIs:** Perform a quick check on any other API endpoints for hardcoded city logic or assumptions (unlikely based on provided files, but good practice).

## V. Frontend Components (React/Next.js)

*   [ ] **`src/app/safety-report/[id]/page.tsx`:**
    *   In `getReportData`, ensure the query fetching accommodation details by `id` also selects the `city_id`.
    *   Store the fetched `city_id` in the `reportData` state.
    *   Pass the retrieved `city_id` from `reportData` to the `findSimilarAccommodations` function call.
    *   Modify `findSimilarAccommodations`: Add a `.eq('city_id', cityId)` filter to the Supabase query for fetching similar accommodations.
    *   Verify `findClosestSafetyMetricsBatch` uses location coordinates for its lookup. Assuming `safety_metrics` are correctly tagged with `city_id` and indexed geographically (PostGIS), this should work without explicit city filtering here.
    *   [ ] **Review Error Messages:** Check toast messages related to data loading (e.g., in `loadData`) for LA-specific text.
*   [ ] **`src/app/components/navbar.tsx` / `src/app/safety-report/components/URLProcessor.tsx`:**
    *   No direct changes needed in these components, as they rely on `/api/process-url` handling the multi-city lookup correctly.
    *   Consider updating placeholder text (e.g., "Paste Airbnb or Booking.com URL here") if needed, but it seems generic enough.
    *   [ ] **Review Error Messages:** Check toast messages (e.g., invalid URL, processing errors) for LA-specific text.
*   [ ] **`src/app/safety-report/components/MapView.tsx`:**
    *   No changes needed if `similarAccommodations` are correctly filtered by city in `page.tsx` before being passed as props.

## VI. Documentation

*   [ ] **Update `PRD.md`:**
    *   Change mentions of "LA Only" or "initial focus is on Los Angeles" to reflect multi-city capability.
    *   Update examples of data sources if they differ significantly for new cities (e.g., provide links to NYC/Miami crime data portals).
    *   Adjust feature descriptions and target user sections if multi-city support changes the scope.
*   [ ] **Update README/Setup Docs:**
    *   Add instructions on how to configure and run the Python (`city_safety_processor.py`) and Node.js (`ingest-reddit-opinions.ts`) scripts for different cities.
    *   Document the structure of the city configuration files/database table.
    *   Explain how to add support for a new city (add entry to `cities` table, create config, source data).

## VII. Environment Variables (`.env`)

*   [ ] **Review:** Check if different cities require fundamentally different API keys (e.g., separate Mapbox tokens per region - unlikely, or different crime data API keys). Prefer storing URLs/keys in the city configuration files/DB table unless they are truly global secrets like the Supabase keys. Minimize changes to `.env`.
    *   **Clarification:** City-specific endpoint URLs or API keys (if they vary per city) should reside within the city configuration mechanism (e.g., `config/nyc.json`), **not** directly in the global `.env` file.

## VIII. Testing (MVP Scope)

*   [ ] **Data Processing Scripts:** Test Python and Node.js scripts by running them manually for LA, NYC, and MIA, verifying data is correctly processed and stored with the appropriate `city_id` in Supabase. Check logs for errors.
*   [ ] **API Endpoint (`/api/process-url`):** Test with known accommodation URLs from LA, NYC, and MIA. Verify it correctly identifies the accommodation and allows navigation to the report page. Test with URLs from unsupported cities or invalid URLs to check error handling.
*   [ ] **Report Page (`/safety-report/[id]`):**
    *   Load reports for accommodations in LA, NYC, and MIA.
    *   Verify that safety metrics displayed are relevant to the location.
    *   Verify that "Similar Accommodations" shown on the map are filtered to the *same city* as the main accommodation.
*   [ ] **UI Text:** Manually review key pages (Landing, Report) to ensure no hardcoded "Los Angeles" or "LA" text remains visible to the user inappropriately. 