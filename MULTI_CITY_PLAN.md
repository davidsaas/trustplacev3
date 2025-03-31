# Multi-City Support Checklist (MVP)

This checklist tracks the progress of adapting the Trustplace application to support multiple cities.

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
- [✅] Parameterize script to accept city input (`import-accommodations.ts`).
- [✅] Use/extend city configuration mechanism (align with Python script) (`import-accommodations.ts`).
- [✅] Identify and add NYC/MIA Apify/data source URLs to config (`import-accommodations.ts`).
- [ ] Refactor geocoding (`geocodeRedditItem`) to remove hardcoded LA values and use city config (`ingest-reddit-opinions.ts`).
- [✅] Update data fetching to use city-specific URLs (`import-accommodations.ts`).
- [✅] Ensure correct `city_id` is included during DB insertion (`import-accommodations.ts`).
- [✅] Enhance logging for city context (`import-accommodations.ts`).
- [✅] Update execution commands for multi-city runs (User responsibility).

## IV. Backend API (Next.js)
- [ ] Refactor `/api/process-url` to look up accommodations without city pre-filtering and select `city_id`.
- [ ] Review `/api/process-url` error messages for generic language.
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
- [ ] Review `.env` - ensure city-specific keys/URLs are in the config mechanism.

## VIII. Testing
- [ ] Test data processing scripts for LA, NYC, MIA.
- [ ] Test `/api/process-url` with URLs from different cities.
- [ ] Test report page functionality for different cities (metrics, similar accommodations filtering).
- [ ] Manually review UI text for hardcoded city names. 