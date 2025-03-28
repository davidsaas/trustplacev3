#!/usr/bin/env python3
"""
LA Safety Metrics Processor - Enhanced Implementation
Processes LAPD crime data and creates safety metrics linked to census blocks
using geospatial matching via Supabase RPC.
Schema Aligned Version. V6 - Added Property & Daytime Metrics.
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
from scipy.spatial import KDTree
from postgrest.exceptions import APIError

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


# Define safety metric types and their MO codes (V6 mapping)
SAFETY_METRICS = {
    'night': {
        'question': 'Can I go outside after dark?',
        'description': 'Safety for pedestrians during evening/night hours',
        'crime_codes': [
            '110', '113', '121', '122', '815', '820', '821', '210', '220', # Violent crimes
            '230', '231', '235', '236', '250', '251', # Assaults, Domestic Violence
            '624', '761', '762', '763', '860', '930', # Battery, Public Intox/Conduct, Indecent Exposure
            # Added based on UCR list review
            '353', # Drunkroll
            '453', # Drunkroll - attempted
            '623', # Battery on Police Officer
        ],
        'time_filter': lambda hour: hour >= 18 or hour < 6 # 6 PM to 5:59 AM
    },
    'vehicle': {
        'question': 'Can I park here safely?',
        'description': 'Risk of vehicle theft and break-ins',
        'crime_codes': [
            '330', '331', # Burglary FROM Vehicle
            '410', '420', '421', # Theft FROM Vehicle (Grand/Petty)
            '510', '520', # Vehicle Stolen / Attempt
            '433', # Theft, Vehicle Parts
            '647' # Vandalism to Vehicle
            # No additions identified from UCR list review
        ]
    },
    'child': {
        'question': 'Are kids safe here?',
        'description': 'Overall safety concerning crimes that could affect children',
        'crime_codes': [
            '235', '627', '237', # Child Abuse/Neglect/Endangerment
            '812', '813', '814', # Sex Offenses involving Children
            '815', '121', '122', # Sex Offenses (General - risk indicator)
            '820', '821', # Aggravated Assault (General - risk indicator)
            '760', '762', # Lewd Conduct / Annoying Children
            '921', '922', # Missing Persons (Juvenile) / Found Juvenile (Indicators)
            '236' # Domestic Violence (Environmental risk)
            # No additions identified from UCR list review
        ]
    },
    'transit': {
        'question': 'Is it safe to use public transport?',
        'description': 'Safety at and around transit locations',
        'crime_codes': [
            '210', '220', # Robbery
            '230', '231', # Assault w/ Deadly Weapon
            '350', '351', # Theft, Person / Pickpocket (Note: 351 is Pursesnatch)
            # '450', '451', '452', # Pickpocket (if distinct codes exist) - Replaced by specific codes below
            '624', # Battery / Simple Assault
            '761', '762', '763', # Public Intox/Conduct
            '930', # Disorderly Conduct
            '946', # Drunk Driving / DUI (Indicator of risky behavior near transit)
            '860', # Indecent Exposure
            # Added based on UCR list review
            '352', # Pickpocket
            '450', # Theft from person - attempted
            '451', # Pursesnatch - attempted
            '452', # Pickpocket - attempted
            '480', # Bicycle - stolen
            '485', # Bicycle - attempted stolen
        ]
        # Note: May need refinement based on how LAPD codes transit-specific offenses
    },
    'women': {
        'question': 'Would I be harassed here?',
        'description': 'Assessment of crimes that disproportionately affect women',
        'crime_codes': [
            '121', '122', # Rape / Attempt
            '815', '820', '821', # Sex Offenses / Aggravated Assault
            '236', # Domestic Violence
            '626', # Battery with Sexual Contact
            '624', # Battery / Simple Assault (often involves harassment)
            '763', # Annoying/Molesting
            '860', # Indecent Exposure
            '922', # Stalking (if code exists, else covered by others) - Note: 922 is Found Juvenile in child metric, check LAPD codes if Stalking has a specific code. Keeping 763 for now.
            '930' # Disorderly Conduct (can include harassment)
            # No additions identified from UCR list review
        ]
    },
    # --- NEW METRICS ---
    'property': {
        'question': 'How likely is a break-in or theft at my rental/home?',
        'description': 'Risk of residential burglary, non-vehicle theft, and vandalism',
        'crime_codes': [
            '310', # BURGLARY
            '320', # BURGLARY, ATTEMPTED
            '341', # THEFT-GRAND ($950.01 & OVER)
            '343', # THEFT, GRAND ($950.01 & OVER) - ATTEMPT (Note: UCR list has 343 as Shoplifting, but keeping script's likely intent)
            '350', # THEFT, PERSON (e.g. from yard/porch if not burglary)
            '351', # THEFT, PERSON - ATTEMPT (Note: UCR list has 351 as Pursesnatch)
            '440', # THEFT-PLAIN - PETTY ($950 & UNDER)
            '441', # THEFT-PLAIN - PETTY ($950 & UNDER) - ATTEMPT
            '740', # VANDALISM - FELONY ($400 & OVER)
            '745', # VANDALISM - MISDEMEANOR ($399 OR UNDER)
            # Added based on UCR list review
            '450', # Theft from person - attempted
            '451', # Pursesnatch - attempted
            '480', # Bicycle - stolen
            '485', # Bicycle - attempted stolen
        ]
        # Excludes vehicle-specific theft/burglary covered in 'vehicle' metric
    },
    'daytime': {
        'question': 'How safe is it to walk around during the day?',
        'description': 'Safety for pedestrians and general activity during daytime hours (9 AM - 5 PM)',
        'crime_codes': [
            '210', '220', # Robbery
            '230', '231', # Assault w/ Deadly Weapon
            '624', # Battery / Simple Assault
            '626', # Battery with Sexual Contact
            '860', # Indecent Exposure
            '930', # Disorderly Conduct/Drunk/Drugs
            '236', # Intimate Partner Assault (if public)
            '350', '351', # Theft, Person (Pickpocket/Snatching)
            # Consider adding others if data suggests daytime prevalence
            # Added based on UCR list review
            '450', # Theft from person - attempted
            '451', # Pursesnatch - attempted
            '623', # Battery on Police Officer
        ],
        'time_filter': lambda hour: 9 <= hour < 17 # 9:00 AM to 4:59 PM
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


# --- NEW: Accommodation Score Update Logic ---
def calculate_distance_km(lat1, lon1, lat2, lon2):
    """Calculate distance between two lat/lon points in kilometers using Haversine formula."""
    # Radius of Earth in kilometers
    R = 6371.0

    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    distance = R * c
    return distance

def update_accommodation_safety_scores(supabase_client: Client):
    """
    Calculates and updates the overall_safety_score for accommodations
    based on the latest safety_metrics.
    """
    logger.info("Starting accommodation overall safety score update...")
    MAX_METRIC_DISTANCE_KM = 1.0 # Only consider metrics within 1km (adjust as needed)
    REQUIRED_METRIC_TYPES = set(SAFETY_METRICS.keys())
    logger.info(f"Calculating overall score based on {len(REQUIRED_METRIC_TYPES)} required metric types: {', '.join(sorted(list(REQUIRED_METRIC_TYPES)))}")

    try:
        # 1. Fetch all current safety metrics for the relevant city (e.g., LA City ID 1)
        # Assuming LA city_id is 1, adjust if necessary OR remove if accommodations don't have city_id
        metrics_response = supabase_client.table('safety_metrics') \
                                          .select('id, latitude, longitude, metric_type, score') \
                                          .eq('city_id', 1) \
                                          .not_.is_('latitude', 'null') \
                                          .not_.is_('longitude', 'null') \
                                          .execute()

        if not metrics_response.data:
            logger.warning("No safety metrics found to calculate accommodation scores.")
            return

        metrics_df = pd.DataFrame(metrics_response.data)
        metrics_df['latitude'] = pd.to_numeric(metrics_df['latitude'], errors='coerce')
        metrics_df['longitude'] = pd.to_numeric(metrics_df['longitude'], errors='coerce')
        metrics_df.dropna(subset=['latitude', 'longitude'], inplace=True)

        if metrics_df.empty:
            logger.warning("No valid safety metrics after cleaning.")
            return

        logger.info(f"Loaded {len(metrics_df)} valid safety metrics.")

        # 2. Build KDTree from metric coordinates for fast nearest neighbor search
        metric_coords = metrics_df[['latitude', 'longitude']].values
        try:
             metric_tree = KDTree(metric_coords)
             logger.info("KDTree built for safety metrics.")
        except Exception as tree_err:
             logger.error(f"Failed to build KDTree: {tree_err}", exc_info=True)
             return


        # 3. Fetch all accommodations with valid coordinates (FIXED: city_id filter removed/commented)
        acc_response = supabase_client.table('accommodations') \
                                      .select('id, latitude, longitude') \
                                      .not_.is_('latitude', 'null') \
                                      .not_.is_('longitude', 'null') \
                                      .execute() # Removed .eq('city_id', 1)

        if not acc_response.data:
            logger.info("No accommodations found with valid coordinates to update scores for.")
            return

        accommodations = acc_response.data
        logger.info(f"Fetched {len(accommodations)} accommodations to update scores.")

        # 4. Prepare updates
        updates_to_make = []
        processed_count = 0
        scores_calculated_count = 0 # Count how many scores were non-null
        missing_types_logged_count = 0 # Counter for logging missing types
        MAX_MISSING_TYPE_LOGS = 20 # Limit how many detailed missing logs we show

        for acc in tqdm(accommodations, desc="Calculating accommodation scores"):
            try:
                acc_id = acc['id']
                acc_lat = float(acc['latitude'])
                acc_lon = float(acc['longitude'])

                # 5. Find nearest metrics using KDTree
                k_neighbors = 50 # Check the nearest 50 metrics (adjust as needed)
                # Handle potential errors if KDTree query fails
                try:
                    distances, indices = metric_tree.query([acc_lat, acc_lon], k=min(k_neighbors, len(metric_coords))) # Ensure k <= number of points
                except Exception as query_err:
                    logger.warning(f"KDTree query failed for Acc {acc_id} at ({acc_lat}, {acc_lon}): {query_err}")
                    continue # Skip this accommodation if query fails

                closest_metrics_by_type = {}

                # Iterate through the nearest neighbors found
                valid_indices = [idx for idx in indices if idx < len(metrics_df)] # Filter out potential out-of-bounds indices
                # DEBUG: Log the number of valid neighbors found within k
                # logger.debug(f"Acc {acc_id}: KDTree found {len(valid_indices)} potential metrics nearby.")

                for index in valid_indices:
                    metric = metrics_df.iloc[index]
                    metric_lat = metric['latitude']
                    metric_lon = metric['longitude']
                    metric_type = metric['metric_type']
                    metric_score = metric['score']

                    # Calculate actual distance
                    dist_km = calculate_distance_km(acc_lat, acc_lon, metric_lat, metric_lon)

                    # Only consider metrics within the defined radius
                    if dist_km > MAX_METRIC_DISTANCE_KM:
                        continue

                    # If we haven't found a metric of this type yet, or this one is closer
                    if metric_type not in closest_metrics_by_type or dist_km < closest_metrics_by_type[metric_type]['distance']:
                        closest_metrics_by_type[metric_type] = {
                            'score': metric_score,
                            'distance': dist_km
                            # DEBUG: Optionally log found metric
                            # logger.debug(f"Acc {acc_id}: Found metric '{metric_type}' (Score: {metric_score}) at distance {dist_km:.3f}km.")
                        }

                # 6. Calculate overall score
                found_metric_types = set(closest_metrics_by_type.keys())
                overall_score = None # Default to None

                # Check if ALL required types were found
                if found_metric_types == REQUIRED_METRIC_TYPES:
                    total_score = sum(m['score'] for m in closest_metrics_by_type.values())
                    # Replicate frontend calculation: average * 10, rounded.
                    average_score = total_score / len(REQUIRED_METRIC_TYPES)
                    overall_score = int(round(average_score * 10))
                    scores_calculated_count += 1 # Increment count of successful calculations
                    logger.debug(f"Acc {acc_id}: Found all {len(REQUIRED_METRIC_TYPES)} types. Total={total_score}, Avg={average_score:.2f}, Overall={overall_score}")
                else:
                    # *** START ENHANCED LOGGING ***
                    missing_types = REQUIRED_METRIC_TYPES - found_metric_types
                    # Log detailed missing types only for a limited number of accommodations
                    if missing_types and missing_types_logged_count < MAX_MISSING_TYPE_LOGS:
                         logger.warning(f"Acc {acc_id}: Score is NULL. Found {len(found_metric_types)}/{len(REQUIRED_METRIC_TYPES)} types. "
                                        f"Missing types within {MAX_METRIC_DISTANCE_KM}km: {', '.join(sorted(list(missing_types)))}")
                         # Log the types that *were* found for context
                         if found_metric_types:
                             logger.warning(f"Acc {acc_id}: Found types: {', '.join(sorted(list(found_metric_types)))}")
                         else:
                             logger.warning(f"Acc {acc_id}: Found NO metric types within {MAX_METRIC_DISTANCE_KM}km.")
                         missing_types_logged_count += 1
                    elif missing_types and missing_types_logged_count == MAX_MISSING_TYPE_LOGS:
                        logger.warning(f"Acc {acc_id}: Score is NULL due to missing types (Further detailed logs suppressed).")
                        missing_types_logged_count += 1
                    # *** END ENHANCED LOGGING ***

                # 7. Append update, even if score is None (to clear old scores)
                updates_to_make.append({
                    'id': acc_id,
                    'overall_safety_score': overall_score
                })
                processed_count += 1

            except (ValueError, TypeError) as coord_err:
                 logger.warning(f"Skipping accommodation {acc.get('id', 'N/A')} due to invalid coordinates: {coord_err}")
            except Exception as calc_err:
                logger.error(f"Error calculating score for accommodation {acc.get('id', 'N/A')}: {calc_err}", exc_info=False) # Keep log concise

        logger.info(f"Processed {processed_count} accommodations. Calculated {scores_calculated_count} non-null overall scores.")
        if scores_calculated_count == 0 and processed_count > 0:
            logger.critical(f"CRITICAL: No overall safety scores were calculated for any of the {processed_count} processed accommodations. Check 'Missing types' logs above.")
        elif processed_count > 0 and scores_calculated_count < processed_count:
             logger.warning(f"WARNING: Only {scores_calculated_count} out of {processed_count} processed accommodations received a non-null score. Check 'Missing types' logs.")


        # 8. Batch update accommodations
        batch_size = 100 # Adjust batch size as needed
        total_updated = 0
        total_failed = 0
        logger.info(f"Starting batch updates for {len(updates_to_make)} accommodations...")

        for i in range(0, len(updates_to_make), batch_size):
            batch = updates_to_make[i:i + batch_size]
            batch_number = (i // batch_size) + 1
            logger.info(f"Updating accommodation scores batch {batch_number}/{math.ceil(len(updates_to_make) / batch_size)} ({len(batch)} records)")
            try:
                # Use .update() instead of .upsert()
                updated_in_batch = 0
                failed_in_batch = 0
                for update_item in batch:
                    try:
                        # Update requires a filter (.eq) first
                        result = supabase_client.table('accommodations') \
                                               .update({'overall_safety_score': update_item['overall_safety_score']}) \
                                               .eq('id', update_item['id']) \
                                               .execute()
                        # Check result.data or status code if needed, assuming success if no exception
                        updated_in_batch += 1
                    except APIError as update_err:
                        logger.error(f"APIError updating accommodation {update_item['id']}: {update_err}", exc_info=False)
                        failed_in_batch += 1
                    except Exception as generic_err:
                         logger.error(f"Generic error updating accommodation {update_item['id']}: {generic_err}", exc_info=False)
                         failed_in_batch += 1

                logger.info(f"Batch {batch_number} update attempt finished. Updated: {updated_in_batch}, Failed: {failed_in_batch}")
                total_updated += updated_in_batch
                total_failed += failed_in_batch

            except APIError as e: # Keep outer catch for potential broader API issues
                logger.error(f"APIError during accommodation scores batch {batch_number}: {e}", exc_info=False) # Log concise error
                total_failed += len(batch) # Assume all failed if batch operation itself failed (though less likely now)
            except Exception as e: # Catch potential unexpected errors during batch processing
                logger.error(f"Unexpected error during accommodation scores batch {batch_number}: {e}", exc_info=True)
                total_failed += len(batch)
            # Add a small delay between batches if needed to avoid rate limiting
            # time.sleep(0.1)

        logger.info(f"Finished accommodation score update. Updated: {total_updated}, Failed: {total_failed}")

    except Exception as e:
        logger.error(f"An error occurred during the accommodation score update process: {e}", exc_info=True)
    finally:
        logger.info("Accommodation score update process finished.")
        logger.info("\n====== Safety Metrics Processing COMPLETED ======")

# --- Main Execution ---
def main(test_mode=False):
    start_time = datetime.now()
    logger.info(f"====== Starting Safety Metrics Processing run at {start_time.isoformat()} ======")
    logger.info(f"Mode: {'TEST' if test_mode else 'PRODUCTION'}")
    logger.info(f"Using neighbor radius: {NEIGHBOR_RADIUS_METERS} meters")

    days_back = 100
    max_records = 5000
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

        # --- NEW STEP 5: Update Accommodation Scores ---
        logger.info("\n=== STEP 5: Updating Overall Scores for Accommodations ===")
        try:
            # Ensure supabase client is initialized and passed
            update_accommodation_safety_scores(supabase)
            logger.info("Accommodation score update process finished.")
        except Exception as score_update_err:
            logger.error(f"Failed to update accommodation scores: {score_update_err}", exc_info=True)
            # Decide if this error should be critical or just logged

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"\n====== Safety Metrics Processing COMPLETED ======")
        logger.info(f"Total execution time: {duration:.2f} seconds ({duration / 60.0:.2f} minutes)")

    except Exception as e:
        logger.critical(f"An unhandled error occurred in the main execution pipeline: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    RUN_IN_TEST_MODE = False
    main(test_mode=RUN_IN_TEST_MODE)