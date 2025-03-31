# Multi-City Support Checklist (MVP)

This checklist tracks the progress of adapting the Trustplace application to support multiple cities.

## Guide: Adding a New City

1.  **Database:** Add a new row to the `cities` table in Supabase for the new city, noting its assigned `id`.
2.  **Configuration File:**
    *   Create a new configuration file: `config/cities/{new_city_id}.json` (e.g., `config/cities/4.json`).
    *   Copy the structure from an existing file (e.g., `1.json`).
    *   Update `city_id` and `city_name`.
    *   Fill in city-specific details:
        *   `crime_data` source information.
        *   Path to the correct `crime_code_mapping_file` (you might need to create this mapping).
        *   `mapbox_config` (bbox, proximity, optional region).
        *   `apify_urls` (accommodations_airbnb, accommodations_booking, reddit_opinions_url) - Use actual URLs.
        *   `context_places` array with relevant local names for geocoding.
3.  **Run Ingestion Scripts:**
    *   Import accommodations: `npm run script:import-accommodations -- --city-id {new_city_id}`
    *   Ingest opinions: `npm run script:ingest-opinions -- --city-id {new_city_id}`
4.  **Run Processing Script:**
    *   Generate safety metrics: `python src/lib/safety-metrics/city_safety_processor.py --city-id {new_city_id}`
5.  **Testing:** Test API endpoints and frontend functionality specifically for the new city.

---

## I. Database (Supabase)
- [✅] Populate `cities` table with NYC and Miami data.
- [✅] Confirm `city_id` foreign keys exist and are configured.

## II. Backend Data Processing (Python)
- [✅] Rename script (`la_safety_processor.py` -> `city_safety_processor.py`).
- [✅] Parameterize script to accept city input.
- [✅] Create and implement city configuration mechanism (JSON files recommended).
- [✅] Identify and add NYC/MIA crime data sources to config.
- [✅] Refactor script to use city-specific config (data fetching, processing, geo functions, metrics calculation).
- [✅] Update data upload (`upload_metrics`, `update_accommodation_safety_scores`) to use correct `city_id`.
- [✅] Enhance logging for city context.
- [✅] Update execution commands/scripts for multi-city runs.

## III. Backend Data Ingestion (Node.js)
- [✅] Parameterize script to accept city input (`import-accommodations.ts`, `ingest-reddit-opinions.ts`).
- [✅] Use/extend city configuration mechanism (align with Python script) (`import-accommodations.ts`, `ingest-reddit-opinions.ts`).
- [✅] Identify and add NYC/MIA Apify/data source URLs to config (`import-accommodations.ts`, city configs).
- [✅] Refactor geocoding (`geocodeRedditItem`) to remove hardcoded LA values and use city config (`ingest-reddit-opinions.ts`).
- [✅] Update data fetching to use city-specific URLs (`import-accommodations.ts`, `ingest-reddit-opinions.ts`).
- [✅] Ensure correct `city_id` is included during DB insertion (`import-accommodations.ts`, `ingest-reddit-opinions.ts`).
- [✅] Enhance logging for city context (`import-accommodations.ts`, `ingest-reddit-opinions.ts`).
- [✅] Update execution commands for multi-city runs (User responsibility).

## IV. Backend API (Next.js)
- [✅] Refactor `/api/process-url` to look up accommodations without city pre-filtering and select `city_id`.
- [✅] Review `/api/process-url` error messages for generic language.
- [ ] Review `/api/osm-insights` and other APIs for city assumptions.

## V. Frontend Components (React/Next.js)
- [ ] Update `getReportData` in `page.tsx` to select and use `city_id`.
- [ ] Pass `city_id` to `findSimilarAccommodations` and add filter logic.
- [ ] Review error messages in `page.tsx` for generic language.
- [ ] Review error messages in `URLProcessor.tsx` for generic language.
- [ ] Perform general UI text search for "Los Angeles" / "LA" and replace/generalize.

## VI. Documentation
- [ ] Update `PRD.md` to reflect multi-city capability.
- [ ] Update README/Setup Docs with multi-city instructions.

## VII. Environment Variables & Config
- [✅] Review `.env` - ensure city-specific keys/URLs are in the config mechanism.

## VIII. Testing
- [ ] Test data processing scripts for LA, NYC, MIA.
- [ ] Test `/api/process-url` with URLs from different cities.
- [ ] Test report page functionality for different cities (metrics, similar accommodations filtering).
- [ ] Manually review UI text for hardcoded city names. 