#!/usr/bin/env python3
"""
LA Safety Metrics Processor - Enhanced Implementation
Processes LAPD crime data and creates safety metrics linked to census blocks
using geospatial matching via Supabase RPC.
Schema Aligned Version. V5 - Pre-calculate Neighbors for Speed.
"""

import os
import json
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import sys
import logging
from sodapy import Socrata
from tqdm import tqdm
import time
import math

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuration ---
load_dotenv()
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use service role key
LA_APP_TOKEN = os.environ.get("LA_APP_TOKEN")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials in .env file")
    sys.exit(1)

# LAPD API configuration
LAPD_DOMAIN = "data.lacity.org"
LAPD_DATASET_ID = "2nrs-mtv8"
SOCRATA_TIMEOUT = 60 # Timeout in seconds for Socrata requests

# Geospatial configuration
NEIGHBOR_RADIUS_METERS = 400 # Radius for finding neighbors (e.g., 400m ~ 1/4 mile)

# Initialize clients
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    sys.exit(1)

# Initialize Socrata client
socrata_client = Socrata(LAPD_DOMAIN, LA_APP_TOKEN, timeout=SOCRATA_TIMEOUT) if LA_APP_TOKEN else Socrata(LAPD_DOMAIN, None, timeout=SOCRATA_TIMEOUT)
logger.info(f"Socrata client initialized with timeout: {SOCRATA_TIMEOUT} seconds.")


# Define safety metric types and their MO codes (V4 mapping)
SAFETY_METRICS = {
    'night': {
        'question': 'Can I go outside after dark?',
        'description': 'Safety for pedestrians during evening/night hours',
        'crime_codes': [
            '110', '113', '121', '122', '815', '820', '821', '210', '220',
            '230', '231', '235', '236', '250', '251', '624', '761', '762',
            '763', '860', '930'
        ],
        'time_filter': lambda hour: hour >= 18 or hour < 6
    },
    'vehicle': {
        'question': 'Can I park here safely?',
        'description': 'Risk of vehicle theft and break-ins',
        'crime_codes': [
            '330', '331', '410', '420', '421', '510', '520', '433', '647'
        ]
    },
    'child': {
        'question': 'Are kids safe here?',
        'description': 'Overall safety concerning crimes that could affect children',
        'crime_codes': [
            '235', '627', '237', '812', '813', '814', '815', '121', '122',
            '820', '821', '760', '762', '921', '922', '236'
        ]
    },
    'transit': {
        'question': 'Is it safe to use public transport?',
        'description': 'Safety at and around transit locations',
        'crime_codes': [
            '210', '220', '230', '231', '350', '351', '352', '450', '451',
            '452', '624', '761', '762', '763', '930', '946', '860'
        ]
    },
    'women': {
        'question': 'Would I be harassed here?',
        'description': 'Assessment of crimes that disproportionately affect women',
        'crime_codes': [
            '121', '122', '815', '820', '821', '236', '626', '624', '763',
            '860', '922', '930'
        ]
    }
}


# --- Data Fetching (Unchanged) ---
def fetch_crime_data(days_back=90, max_records=300000):
    # (Code remains the same as V4)
    logger.info(f"Fetching crime data from LAPD API for the last {days_back} days.")
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
    end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
    logger.info(f"Date range (UTC): {start_date_str} to {end_date_str}")
    try:
        where_clause = f"date_occ between '{start_date_str}' AND '{end_date_str}' AND lat != 0 AND lon != 0"
        count_query = socrata_client.get(LAPD_DATASET_ID, select="COUNT(*)", where=where_clause)
        total_count = int(count_query[0]['COUNT'])
        records_to_fetch = min(total_count, max_records)
        logger.info(f"Total relevant records available: {total_count}. Fetching up to {records_to_fetch:,} records.")
        if records_to_fetch == 0:
            logger.warning("No crime records found for the specified date range and criteria.")
            return []
        all_data = []
        batch_size = 1000
        offset = 0
        with tqdm(total=records_to_fetch, desc="Fetching records", unit="records") as pbar:
            while offset < records_to_fetch:
                fetch_limit = min(batch_size, records_to_fetch - offset)
                try:
                    batch = socrata_client.get(
                        LAPD_DATASET_ID, where=where_clause, order="date_occ DESC",
                        limit=fetch_limit, offset=offset
                    )
                    if not batch:
                        logger.warning(f"Received empty batch at offset {offset}, stopping fetch.")
                        break
                    all_data.extend(batch)
                    batch_len = len(batch)
                    pbar.update(batch_len)
                    offset += batch_len
                    time.sleep(0.1) # Be courteous
                except requests.exceptions.RequestException as req_err:
                    logger.error(f"Network error fetching batch at offset {offset}: {req_err}")
                    logger.info("Waiting 5 seconds before retrying fetch...")
                    time.sleep(5)
                except Exception as e:
                    logger.error(f"Error fetching batch at offset {offset}: {str(e)}")
                    if len(all_data) > 0:
                        logger.warning(f"Proceeding with {len(all_data)} records fetched so far due to error.")
                        break
                    else: raise
        logger.info(f"Fetch complete. Total records fetched: {len(all_data):,}")
        return all_data
    except Exception as e:
        logger.error(f"Fatal error in fetch_crime_data: {str(e)}", exc_info=True)
        raise

# --- Geospatial Matching (Unchanged) ---
def validate_coordinate(lat, lon):
    # (Code remains the same as V4)
    try:
        lat_f, lon_f = float(lat), float(lon)
        return (-90 < lat_f < 90 and -180 < lon_f < 180 and abs(lat_f) > 1e-6 and abs(lon_f) > 1e-6)
    except (TypeError, ValueError, AttributeError):
        return False

def find_census_blocks_batch_rpc(unique_coords_list):
    # (Code remains the same as V4)
    logger.info(f"Finding census blocks for {len(unique_coords_list)} unique coordinates via RPC.")
    if not unique_coords_list: return {}
    points_json = [{"lat": lat, "lon": lon} for lat, lon in unique_coords_list]
    try:
        response = supabase.rpc('match_points_to_block_groups', {'points_json': points_json}).execute()
        if response.data and isinstance(response.data, list) and len(response.data) == len(unique_coords_list):
            coord_to_block = {}
            matched_count = 0
            for i, (lat, lon) in enumerate(unique_coords_list):
                block_info = response.data[i]
                if block_info and isinstance(block_info, dict) and 'id' in block_info:
                    block_info['total_population'] = block_info.get('total_population') or 0
                    block_info['housing_units'] = block_info.get('housing_units') or 0
                    coord_to_block[(lat, lon)] = block_info
                    matched_count += 1
                else:
                     coord_to_block[(lat, lon)] = None
            logger.info(f"Successfully matched {matched_count} out of {len(unique_coords_list)} coordinates to census blocks (using PK 'id').")
            return coord_to_block
        else:
            logger.error(f"Unexpected response structure or length mismatch from RPC: {response.data}")
            if hasattr(response, 'error') and response.error: logger.error(f"RPC Error details: {response.error}")
            return {}
    except Exception as e:
        logger.error(f"Error calling Supabase RPC 'match_points_to_block_groups': {str(e)}", exc_info=True)
        return {}


# --- Data Processing (Unchanged) ---
def process_crime_data(crime_data):
    # (Code remains the same as V4)
    if not crime_data:
        logger.warning("No crime data provided for processing.")
        return None
    logger.info(f"Processing {len(crime_data)} raw crime records.")
    try:
        df = pd.DataFrame(crime_data)
        logger.info(f"Initial DataFrame shape: {df.shape}")

        df['date_occ'] = pd.to_datetime(df['date_occ'], errors='coerce')
        df.dropna(subset=['date_occ'], inplace=True)
        df['hour'] = df['date_occ'].dt.hour
        df['crm_cd'] = df['crm_cd'].astype(str)
        df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
        df['lon'] = pd.to_numeric(df['lon'], errors='coerce')

        initial_count = len(df)
        df = df[df.apply(lambda row: validate_coordinate(row['lat'], row['lon']), axis=1)].copy()
        validated_count = len(df)
        logger.info(f"Records after coordinate validation: {validated_count} (removed {initial_count - validated_count})")
        if df.empty:
            logger.warning("No valid crime records remain after cleaning and validation.")
            return None

        logger.info("Extracting unique coordinates for block matching.")
        unique_coords_df = df[['lat', 'lon']].drop_duplicates()
        unique_coords_list = list(unique_coords_df.itertuples(index=False, name=None))
        coord_to_block_map = find_census_blocks_batch_rpc(unique_coords_list)
        if not coord_to_block_map and unique_coords_list:
            logger.error("Failed to map coordinates to census blocks via RPC. Cannot proceed.")
            return None

        logger.info("Mapping census block information back to crime records.")
        df['coord_tuple'] = list(zip(df['lat'], df['lon']))
        df['block_info'] = df['coord_tuple'].apply(lambda coord: coord_to_block_map.get(coord))
        initial_count_map = len(df)
        df = df.dropna(subset=['block_info']).copy()
        mapped_count = len(df)
        logger.info(f"Records after mapping to blocks: {mapped_count} (removed {initial_count_map - mapped_count} unmapped)")
        if df.empty:
            logger.error("No crime records could be successfully mapped to census blocks.")
            return None

        df['census_block_id'] = df['block_info'].apply(lambda x: x.get('id'))
        df.dropna(subset=['census_block_id'], inplace=True)
        if df.empty:
             logger.error("No records remaining after requiring census_block_id.")
             return None

        df['population'] = pd.to_numeric(df['block_info'].apply(lambda x: x.get('total_population', 0)), errors='coerce').fillna(0).astype(int)
        df['housing_units'] = pd.to_numeric(df['block_info'].apply(lambda x: x.get('housing_units', 0)), errors='coerce').fillna(0).astype(int)
        df['population_density_proxy'] = df.apply(
            lambda row: row['population'] / row['housing_units'] if row['housing_units'] > 0 else 0,
            axis=1
        ).astype(float)

        df.drop(columns=['coord_tuple', 'block_info'], inplace=True)

        logger.info(f"Successfully processed {len(df)} crime records with census block mapping.")
        return df

    except Exception as e:
        logger.exception(f"Error during process_crime_data: {e}")
        return None

# --- Metric Calculation (Functions Unchanged) ---

def calculate_weighted_incidents(direct_incidents, neighbor_incident_map, density_proxy_value):
    # (Code remains the same as V4)
    try:
        weighted_incidents = float(direct_incidents)
        neighbor_weight = 0.5
        for neighbor_id, incidents in neighbor_incident_map.items():
            weighted_incidents += incidents * neighbor_weight
        density_factor = 1.0
        if density_proxy_value > 0:
             density_factor = min(max(density_proxy_value / 3.0, 0.5), 2.0)
        return weighted_incidents * density_factor
    except Exception as e:
        logger.error(f"Error calculating weighted incidents (direct={direct_incidents}, neighbors={len(neighbor_incident_map)}, density={density_proxy_value}): {str(e)}")
        return float(direct_incidents)

def calculate_safety_score(weighted_incidents):
    # (Code remains the same as V4)
    try:
        w_inc = float(weighted_incidents)
        if w_inc <= 1: score = 9
        elif w_inc <= 3: score = 8
        elif w_inc <= 7: score = 7
        elif w_inc <= 12: score = 6
        elif w_inc <= 20: score = 5
        elif w_inc <= 30: score = 4
        elif w_inc <= 50: score = 3
        else: score = 2
        return max(0, min(10, int(round(score))))
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid input for safety score calculation: {weighted_incidents}. Error: {e}")
        return 5
    except Exception as e:
        logger.error(f"Error calculating safety score for weighted incidents {weighted_incidents}: {str(e)}")
        return 5

def get_risk_description(metric_type, score, direct_incidents, weighted_incidents, density_proxy_value, incidents_per_1000, neighbor_count):
    # (Code remains the same as V4)
    try:
        if score >= 8: risk_level = "Very Low Risk"
        elif score >= 7: risk_level = "Low Risk"
        elif score >= 6: risk_level = "Moderate Risk"
        elif score >= 4: risk_level = "High Risk"
        else: risk_level = "Very High Risk"
        base_description = SAFETY_METRICS[metric_type]['description']
        if density_proxy_value > 3: density_category = "high housing density"
        elif density_proxy_value > 1.5: density_category = "medium housing density"
        elif density_proxy_value > 0: density_category = "low housing density"
        else: density_category = "unknown housing density"
        description = f"{risk_level} ({base_description.lower()})."
        description += f" Based on {direct_incidents} relevant incident(s) reported recently in this block."
        # Optional: Uncomment/modify to include neighbor context
        # description += f" Analysis considers activity from {neighbor_count} nearby blocks (within {NEIGHBOR_RADIUS_METERS}m)."
        debug_info = f"metric={metric_type}, score={score}, direct={direct_incidents}, w_inc={weighted_incidents:.1f}, " \
                     f"inc_p1k={incidents_per_1000:.1f}, dens_proxy={density_proxy_value:.2f}, neighbors={neighbor_count}"
        logger.debug(f"Risk Description Details: {debug_info}")
        return description
    except Exception as e:
        logger.error(f"Error generating risk description: {str(e)}")
        return "Risk level could not be determined due to an error."


# --- Metric Calculation (Main Logic - MODIFIED FOR SPEED) ---
def calculate_metrics(processed_df):
    """Calculate all safety metrics for each relevant census block, pre-calculating neighbors."""
    if processed_df is None or processed_df.empty:
        logger.warning("No processed data available to calculate metrics.")
        return {}
    logger.info("Calculating safety metrics for census blocks.")

    results = {}
    la_city_id = None
    try:
        city_result = supabase.table('cities').select('id').eq('name', 'Los Angeles').limit(1).single().execute()
        if city_result.data:
            la_city_id = city_result.data['id']
            logger.info(f"Found Los Angeles city ID: {la_city_id}")
        else:
            logger.error("Could not find 'Los Angeles' in the 'cities' table.")
            raise ValueError("Missing LA city ID")
    except Exception as e:
        logger.error(f"Error fetching city ID: {e}", exc_info=True)
        raise

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)

    # --- *** SPEED IMPROVEMENT: Pre-calculate Neighbors *** ---
    logger.info("Pre-calculating neighbors for all unique blocks...")
    neighbor_cache = {}
    # Get all unique block IDs that actually have crime incidents in the processed data
    unique_block_ids_in_data = processed_df['census_block_id'].unique()
    logger.info(f"Found {len(unique_block_ids_in_data)} unique blocks with incidents to check for neighbors.")

    # Loop through unique blocks ONCE to fetch neighbors
    for block_id in tqdm(unique_block_ids_in_data, desc="Fetching neighbors"):
        try:
            neighbor_response = supabase.rpc('find_block_neighbors_within_radius', {
                'target_block_id': block_id,
                'radius_meters': NEIGHBOR_RADIUS_METERS
            }).execute()

            if neighbor_response.data:
                neighbor_ids = [item['neighbor_block_id'] for item in neighbor_response.data]
                neighbor_cache[block_id] = neighbor_ids
            else:
                neighbor_cache[block_id] = [] # Store empty list if no neighbors or error
                if hasattr(neighbor_response, 'error') and neighbor_response.error:
                     logger.warning(f"RPC error finding neighbors for {block_id}: {neighbor_response.error}")
        except Exception as rpc_err:
            logger.error(f"Exception calling RPC find_block_neighbors_within_radius for {block_id}: {rpc_err}")
            neighbor_cache[block_id] = [] # Store empty list on exception

    logger.info(f"Pre-calculation complete. Found neighbor sets for {len(neighbor_cache)} blocks.")
    # --- *** END SPEED IMPROVEMENT *** ---


    # --- Main Metric Calculation Loop ---
    for metric_type, metric_info in SAFETY_METRICS.items():
        logger.info(f"--- Processing Metric: {metric_type} ---")

        metric_crimes_df = processed_df[processed_df['crm_cd'].isin(metric_info['crime_codes'])].copy()
        if 'time_filter' in metric_info:
            metric_crimes_df = metric_crimes_df[metric_crimes_df['hour'].apply(metric_info['time_filter'])]

        if metric_crimes_df.empty:
            logger.info(f"No relevant incidents found for metric '{metric_type}'.")
            results[metric_type] = []
            continue

        logger.info(f"Found {len(metric_crimes_df)} incidents for metric '{metric_type}'.")

        block_group_stats = metric_crimes_df.groupby('census_block_id').agg(
            direct_incidents=('crm_cd', 'size'),
            latitude=('lat', 'mean'),
            longitude=('lon', 'mean'),
            population=('population', 'first'),
            housing_units=('housing_units', 'first'),
            population_density_proxy=('population_density_proxy', 'first')
        ).reset_index()

        logger.info(f"Aggregated stats for {len(block_group_stats)} census blocks for metric '{metric_type}'.")

        metric_incident_map = block_group_stats.set_index('census_block_id')['direct_incidents'].to_dict()

        metric_records = []
        # --- Loop through each block that has incidents for THIS metric ---
        # --- THIS LOOP IS NOW MUCH FASTER ---
        for _, block_row in tqdm(block_group_stats.iterrows(), total=len(block_group_stats), desc=f"Calculating {metric_type} metrics"):
            current_block_id = block_row['census_block_id']
            direct_incidents = block_row['direct_incidents']
            pop_density_proxy = block_row['population_density_proxy']
            population = block_row['population']

            # --- *** Use the pre-calculated neighbor cache *** ---
            neighbor_ids = neighbor_cache.get(current_block_id, []) # Efficient dictionary lookup
            # --- *** No RPC call inside this loop anymore! *** ---

            neighbor_incident_map = {
                nid: metric_incident_map.get(nid, 0) for nid in neighbor_ids if nid in metric_incident_map
            }
            neighbor_count = len(neighbor_ids)

            weighted_incidents = calculate_weighted_incidents(direct_incidents, neighbor_incident_map, pop_density_proxy)
            score = calculate_safety_score(weighted_incidents)
            incidents_per_1000 = (direct_incidents / population) * 1000 if population > 0 else 0.0

            description = get_risk_description(
                metric_type, score, direct_incidents, weighted_incidents, pop_density_proxy, incidents_per_1000, neighbor_count
            )

            id_string = f"{la_city_id}:{current_block_id}:{metric_type}"
            stable_metric_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, id_string))

            geom_string = f"SRID=4326;POINT({block_row['longitude']} {block_row['latitude']})"

            metric_record = {
                'id': stable_metric_id,
                'city_id': la_city_id,
                'block_group_id': current_block_id, # Ensure this matches target column name
                'latitude': float(block_row['latitude']),
                'longitude': float(block_row['longitude']),
                'geom': geom_string,
                'metric_type': metric_type,
                'score': score,
                'question': metric_info['question'],
                'description': description,
                'direct_incidents': int(direct_incidents),
                'weighted_incidents': float(weighted_incidents),
                'population_density': float(pop_density_proxy), # Ensure this matches target column name
                'incidents_per_1000': float(incidents_per_1000),
                'created_at': now.isoformat(),
                'expires_at': expires_at.isoformat()
                # 'neighbor_count': neighbor_count # Optional
            }
            metric_records.append(metric_record)

        results[metric_type] = metric_records
        logger.info(f"Generated {len(metric_records)} metrics for type '{metric_type}'.")

    return results


# --- Data Uploading (Unchanged) ---
def upload_metrics(metrics_by_type, test_mode=False):
    # (Code remains the same as V4)
    logger.info("--- Uploading metrics to Supabase using UPSERT ---")
    if not metrics_by_type:
        logger.warning("No metrics generated to upload.")
        return
    all_metrics = []
    metric_types_processed = set()
    for metric_type, metrics in metrics_by_type.items():
        if metrics:
            all_metrics.extend(metrics)
            metric_types_processed.add(metric_type)
    total_metrics_to_upload = len(all_metrics)
    logger.info(f"Total metrics to upsert: {total_metrics_to_upload:,} across types: {', '.join(metric_types_processed)}")
    if total_metrics_to_upload == 0:
        logger.info("No metrics to upload.")
        return

    uploaded_count = 0
    failed_count = 0
    batch_size = 500
    num_batches = math.ceil(total_metrics_to_upload / batch_size)
    for i in range(num_batches):
        batch = all_metrics[i * batch_size : (i + 1) * batch_size]
        logger.info(f"Upserting batch {i + 1}/{num_batches} ({len(batch)} records)")
        try:
            # ** Make sure 'safety_metrics' table exists and 'id' is primary key **
            # ** Make sure the foreign key constraint issue from previous error is fixed **
            result = supabase.table('safety_metrics').upsert(
                batch, on_conflict='id'
            ).execute()
            if hasattr(result, 'error') and result.error:
                logger.error(f"Error upserting batch {i + 1}: {result.error}")
                failed_count += len(batch)
                if batch: logger.error(f"Sample record from failed batch: {json.dumps(batch[0], default=str)[:500]}...")
            elif result.data:
                 count_in_batch = len(result.data)
                 uploaded_count += count_in_batch
                 logger.info(f"Batch {i + 1} upsert successful ({count_in_batch} records processed in response).")
                 if count_in_batch < len(batch): logger.warning(f"Batch {i+1} response count ({count_in_batch}) < batch size ({len(batch)}).")
            else:
                 logger.warning(f"Batch {i + 1} upsert response did not contain data, but no explicit error reported. Assuming success for {len(batch)} records.")
                 uploaded_count += len(batch)
        except Exception as e:
            # Catch potential APIError for detailed logging
            logger.error(f"Exception upserting batch {i + 1}: {str(e)}", exc_info=True)
            # Log specific details if available (like the previous FK error)
            if hasattr(e, 'message'): logger.error(f"API Error Details: {e.message}")
            failed_count += len(batch)
            if batch: logger.error(f"Sample record from failed batch: {json.dumps(batch[0], default=str)[:500]}...")
    logger.info(f"Upsert complete.")
    logger.info(f"Attempted: {total_metrics_to_upload:,}, Succeeded (approx): {uploaded_count:,}, Failed: {failed_count:,}")
    if failed_count > 0: logger.warning("Some records failed to upsert. Check logs.")


# --- Main Execution (Unchanged) ---
def main(test_mode=False):
    # (Code remains the same as V4)
    start_time = datetime.now()
    logger.info(f"====== Starting Safety Metrics Processing run at {start_time.isoformat()} ======")
    logger.info(f"Mode: {'TEST' if test_mode else 'PRODUCTION'}")
    logger.info(f"Using neighbor radius: {NEIGHBOR_RADIUS_METERS} meters")

    days_back = 800
    max_records = 500000
    if test_mode:
        logger.info("TEST MODE: Using smaller dataset parameters.")
        days_back = 30
        max_records = 5000

    try:
        logger.info(f"\n=== STEP 1: Fetching Crime Data ({days_back} days, max {max_records:,} records) ===")
        raw_crime_data = fetch_crime_data(days_back=days_back, max_records=max_records)
        if not raw_crime_data:
            logger.warning("No crime data fetched. Pipeline stopped.")
            return

        logger.info(f"\n=== STEP 2: Processing and Mapping {len(raw_crime_data):,} Crime Records ===")
        processed_df = process_crime_data(raw_crime_data)
        del raw_crime_data
        if processed_df is None or processed_df.empty:
            logger.error("Crime data processing failed or yielded no results. Pipeline stopped.")
            return

        logger.info(f"\n=== STEP 3: Calculating Safety Metrics from {len(processed_df):,} Processed Records ===")
        metrics_by_type = calculate_metrics(processed_df) # This function is now faster
        del processed_df
        total_metrics = sum(len(m) for m in metrics_by_type.values())
        if total_metrics == 0:
            logger.warning("No safety metrics were generated.")

        logger.info(f"Generated {total_metrics:,} total metrics across {len(metrics_by_type)} categories.")

        logger.info("\n=== STEP 4: Uploading Metrics to Supabase ===")
        upload_metrics(metrics_by_type, test_mode=test_mode)

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"\n====== Safety Metrics Processing COMPLETED ======")
        logger.info(f"Total execution time: {duration:.2f} seconds ({duration / 60.0:.2f} minutes)") # Expect this to be much lower now

    except Exception as e:
        logger.critical(f"An unhandled error occurred in the main execution pipeline: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    RUN_IN_TEST_MODE = False
    main(test_mode=RUN_IN_TEST_MODE)