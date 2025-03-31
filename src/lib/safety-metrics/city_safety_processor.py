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
import argparse

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

# Get the absolute path to the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
# Construct the path to the config file relative to the script directory
# Adjust the relative path (`../../config/`) if needed based on your project structure
config_path = os.path.join(script_dir, '../../config/safety_metrics_config.json')

# Load metric definitions from JSON
try:
    with open(config_path, 'r') as f:
        metric_definitions_list = json.load(f)
    METRIC_DEFINITIONS = {item['id']: item for item in metric_definitions_list}
    logger.info(f"Successfully loaded {len(METRIC_DEFINITIONS)} metric definitions from {config_path}")
except FileNotFoundError:
    logger.error(f"Error: safety_metrics_config.json not found at {config_path}")
    sys.exit(1)
except json.JSONDecodeError:
    logger.error(f"Error: Could not decode JSON from {config_path}")
    sys.exit(1)
except Exception as e:
    logger.error(f"An unexpected error occurred loading metric definitions: {e}")
    sys.exit(1)

# --- Define CRIME CODES and TIME FILTERS separately ---
# These remain backend-specific logic
METRIC_CRIME_CODES = {
    'night': [
        '110', '113', '121', '122', '815', '820', '821', '210', '220',
        '230', '231', '235', '236', '250', '251',
        '624', '761', '762', '763', '860', '930',
        '353', '453', '623'
    ],
    'vehicle': [
        '330', '331', '410', '420', '421', '510', '520', '433', '647'
    ],
    'child': [
        '235', '627', '237', '812', '813', '814', '815', '121', '122',
        '820', '821', '760', '762', '921', '922', '236'
    ],
    'transit': [
        '210', '220', '230', '231', '350', '351', '624', '761', '762',
        '763', '930', '946', '860', '352', '450', '451', '452', '480', '485'
    ],
    'women': [
        '121', '122', '815', '820', '821', '236', '626', '624', '763',
        '860', '930'
    ],
    'property': [
        '310', '320', '341', '343', '350', '351', '440', '441', '740',
        '745', '450', '451', '480', '485'
    ],
    'daytime': [
        '210', '220', '230', '231', '624', '626', '860', '930', '236',
        '350', '351', '450', '451', '623'
    ]
}

METRIC_TIME_FILTERS = {
    'night': lambda hour: hour >= 18 or hour < 6,
    'daytime': lambda hour: 9 <= hour < 17
}

# --- Combine Definitions for Processing --- (If needed by existing functions)
# Or modify functions like calculate_metrics to use METRIC_DEFINITIONS, METRIC_CRIME_CODES, METRIC_TIME_FILTERS directly

# Example: Modifying calculate_metrics to use new structure

def calculate_metrics(processed_df, target_city_id, city_config):
    """Calculate all safety metrics for each relevant census block, pre-calculating neighbors."""
    if processed_df is None or processed_df.empty:
        logger.warning("No processed data available to calculate metrics.")
        return {}
    logger.info("Calculating safety metrics for census blocks.")

    results = {}
    la_city_id = target_city_id
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)

    # --- Load City-Specific Mappings --- 
    city_crime_codes = load_city_crime_mapping(city_config)
    if not city_crime_codes:
         logger.error(f"Failed to load crime code mappings for city {target_city_id}. Cannot calculate metrics.")
         return {}

    # --- Pre-calculate Neighbors (remains mostly the same) --- 
    neighbor_radius = city_config.get('geospatial', {}).get('neighbor_radius_meters', NEIGHBOR_RADIUS_METERS)
    logger.info(f"Pre-calculating neighbors within {neighbor_radius}m for all unique blocks...")
    neighbor_cache = {}
    unique_block_ids_in_data = processed_df['census_block_id'].unique()
    logger.info(f"Found {len(unique_block_ids_in_data)} unique blocks with incidents to check for neighbors.")
    # Loop through unique blocks ONCE to fetch neighbors
    for block_id in tqdm(unique_block_ids_in_data, desc=f"Fetching neighbors for city {target_city_id}"):
        try:
            neighbor_response = supabase.rpc('find_block_neighbors_within_radius', {
                'target_block_id': block_id,
                'radius_meters': neighbor_radius # Use potentially city-specific radius
            }).execute()
            if neighbor_response.data:
                neighbor_ids = [item['neighbor_block_id'] for item in neighbor_response.data]
                neighbor_cache[block_id] = neighbor_ids
            else:
                neighbor_cache[block_id] = [] 
                if hasattr(neighbor_response, 'error') and neighbor_response.error:
                     logger.warning(f"RPC error finding neighbors for {block_id}: {neighbor_response.error}")
        except Exception as rpc_err:
            logger.error(f"Exception calling RPC find_block_neighbors_within_radius for {block_id}: {rpc_err}")
            neighbor_cache[block_id] = []
    logger.info(f"Pre-calculation complete. Found neighbor sets for {len(neighbor_cache)} blocks.")
    # --- End Neighbor Pre-calculation --- 

    # --- Main Metric Calculation Loop ---
    for metric_type, metric_info in METRIC_DEFINITIONS.items():
        logger.info(f"--- Processing Metric: {metric_type} for city {target_city_id} ---")

        metric_crimes_df = processed_df[processed_df['crime_code'].isin(city_crime_codes[metric_type])].copy()
        if 'time_filter' in metric_info:
            metric_crimes_df = metric_crimes_df[metric_crimes_df['hour'].apply(metric_info['time_filter'])]

        if metric_crimes_df.empty:
            logger.info(f"No relevant incidents found for metric '{metric_type}' in city {target_city_id}.")
            results[metric_type] = []
            continue

        logger.info(f"Found {len(metric_crimes_df)} incidents for metric '{metric_type}' in city {target_city_id}.")

        block_group_stats = metric_crimes_df.groupby('census_block_id').agg(
            direct_incidents=('crime_code', 'size'),
            latitude=('lat', 'mean'),
            longitude=('lon', 'mean'),
            population=('population', 'first'),
            housing_units=('housing_units', 'first'),
            population_density_proxy=('population_density_proxy', 'first')
        ).reset_index()

        logger.info(f"Aggregated stats for {len(block_group_stats)} census blocks for metric '{metric_type}' in city {target_city_id}.")

        metric_incident_map = block_group_stats.set_index('census_block_id')['direct_incidents'].to_dict()

        metric_records = []
        # --- Loop through each block that has incidents for THIS metric ---
        # --- THIS LOOP IS NOW MUCH FASTER ---
        for _, block_row in tqdm(block_group_stats.iterrows(), total=len(block_group_stats), desc=f"Calculating {metric_type} metrics for city {target_city_id}"):
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
        logger.info(f"Generated {len(metric_records)} metrics for type '{metric_type}' in city {target_city_id}.")

    return results

# Modify get_risk_description to potentially use the base description from JSON
def get_risk_description(metric_type, score, direct_incidents, weighted_incidents, density_proxy_value, incidents_per_1000, neighbor_count):
    try:
        if score >= 8: risk_level = "Very Low Risk"
        elif score >= 7: risk_level = "Low Risk"
        elif score >= 6: risk_level = "Moderate Risk"
        elif score >= 4: risk_level = "High Risk"
        else: risk_level = "Very High Risk"

        # Get base description from loaded definitions
        base_description = METRIC_DEFINITIONS.get(metric_type, {}).get('description', 'Overall safety risk')

        if density_proxy_value > 3: density_category = "high housing density"
        elif density_proxy_value > 1.5: density_category = "medium housing density"
        elif density_proxy_value > 0: density_category = "low housing density"
        else: density_category = "unknown housing density"

        description = f"{risk_level} ({base_description.lower()})."
        description += f" Based on {direct_incidents} relevant incident(s) reported recently in this block."
        # ... (rest of description generation) ...
        return description
    except Exception as e:
        logger.error(f"Error generating risk description: {str(e)}")
        return "Risk level could not be determined due to an error."

# Ensure update_accommodation_safety_scores uses the JSON keys
def update_accommodation_safety_scores(supabase_client: Client, target_city_id):
    """
    Calculates and updates the overall_safety_score, census_block_id, and city_id
    for accommodations based on the latest safety_metrics.
    """
    logger.info("Starting accommodation overall safety score update...")
    MAX_METRIC_DISTANCE_KM = 2.0 # Only consider metrics within 2km (adjust as needed)
    REQUIRED_METRIC_TYPES = set(METRIC_DEFINITIONS.keys())
    # Assume LA city_id is 1, if needed elsewhere. This script now associates city_id based on closest metric.
    TARGET_CITY_ID_FOR_METRIC_FETCH = target_city_id # Fetch metrics associated with the target city
    logger.info(f"Calculating overall score based on available metric types within {MAX_METRIC_DISTANCE_KM}km.")
    logger.info(f"Required metric types for full score: {len(REQUIRED_METRIC_TYPES)} ({', '.join(sorted(list(REQUIRED_METRIC_TYPES)))})")
    logger.info(f"Fetching safety metrics associated with city_id: {TARGET_CITY_ID_FOR_METRIC_FETCH}")


    try:
        # 1. Fetch all current safety metrics for the relevant city
        # Ensure block_group_id and city_id are selected
        metrics_response = supabase_client.table('safety_metrics') \
                                          .select('id, latitude, longitude, metric_type, score, block_group_id, city_id') \
                                          .eq('city_id', TARGET_CITY_ID_FOR_METRIC_FETCH) \
                                          .not_.is_('latitude', 'null') \
                                          .not_.is_('longitude', 'null') \
                                          .not_.is_('block_group_id', 'null') \
                                          .execute()

        if not metrics_response.data:
            logger.warning(f"No safety metrics found for city_id {TARGET_CITY_ID_FOR_METRIC_FETCH} to calculate accommodation scores.")
            return

        metrics_df = pd.DataFrame(metrics_response.data)
        metrics_df['latitude'] = pd.to_numeric(metrics_df['latitude'], errors='coerce')
        metrics_df['longitude'] = pd.to_numeric(metrics_df['longitude'], errors='coerce')
        # Keep city_id as is, block_group_id as string
        metrics_df.dropna(subset=['latitude', 'longitude', 'block_group_id', 'city_id'], inplace=True)


        if metrics_df.empty:
            logger.warning("No valid safety metrics after cleaning (lat, lon, block_group_id, city_id).")
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


        # 3. Fetch all accommodations for the target city with valid coordinates
        acc_response = supabase_client.table('accommodations') \
                                      .select('id, latitude, longitude') \
                                      .eq('city_id', target_city_id) \
                                      .not_.is_('latitude', 'null') \
                                      .not_.is_('longitude', 'null') \
                                      .execute()

        if not acc_response.data:
            logger.info(f"No accommodations found with valid coordinates for city_id {target_city_id}.")
            return

        accommodations = acc_response.data
        logger.info(f"Fetched {len(accommodations)} accommodations for city_id {target_city_id}.")

        # 4. Prepare updates
        updates_to_make = []
        processed_count = 0
        scores_calculated_count = 0 # Count how many scores were non-null
        missing_types_logged_count = 0 # Counter for logging missing types
        MAX_MISSING_TYPE_LOGS = 20 # Limit how many detailed missing logs we show
        no_metrics_found_count = 0 # Count accommodations with no metrics nearby

        city_name = supabase.table('cities').select('name').eq('id', target_city_id).single().execute().data['name']

        for acc in tqdm(accommodations, desc=f"Calculating scores for {city_name}"):
            try:
                acc_id = acc['id']
                acc_lat = float(acc['latitude'])
                acc_lon = float(acc['longitude'])

                # 5. Find nearest metrics using KDTree
                k_neighbors = 50 # Check the nearest 50 metrics (adjust as needed)
                indices = []
                distances = []
                try:
                    # Ensure k is not larger than the number of points in the tree
                    actual_k = min(k_neighbors, len(metric_coords))
                    if actual_k > 0:
                        distances, indices = metric_tree.query([acc_lat, acc_lon], k=actual_k)
                        # If query returns single result, wrap it in a list
                        if actual_k == 1 and not isinstance(indices, (list, np.ndarray)):
                            distances = [distances]
                            indices = [indices]
                    else:
                         logger.warning(f"KDTree is empty, cannot query neighbors for Acc {acc_id}.")
                         # Skip to append None values later if needed

                except Exception as query_err:
                    logger.warning(f"KDTree query failed for Acc {acc_id} at ({acc_lat}, {acc_lon}): {query_err}")
                    # Continue, will result in no metrics found

                closest_metrics_by_type = {}
                inferred_block_id = None
                inferred_city_id = None
                closest_overall_metric_dist = float('inf')


                # Iterate through the nearest neighbors found
                valid_indices = [idx for idx in indices if idx < len(metrics_df)] # Filter out potential out-of-bounds indices


                # --- Find closest overall metric first to infer block (City ID is known) ---
                if valid_indices:
                    closest_idx = valid_indices[0] # The first index corresponds to the smallest distance
                    closest_metric_info = metrics_df.iloc[closest_idx]
                    closest_overall_metric_dist = calculate_distance_km(acc_lat, acc_lon, closest_metric_info['latitude'], closest_metric_info['longitude'])
                    # Use this closest metric to infer block ID only
                    inferred_block_id = closest_metric_info['block_group_id'] # Use the block_group_id from safety_metrics
                    # inferred_city_id = int(closest_metric_info['city_id']) if pd.notna(closest_metric_info['city_id']) else None # No longer need to infer city_id
                    logger.debug(f"Acc {acc_id}: Closest metric at index {closest_idx} (dist: {closest_overall_metric_dist:.3f}km). Inferred block={inferred_block_id}")
                else:
                     logger.warning(f"Acc {acc_id}: No valid indices found from KDTree query.")


                # --- Now, find the closest metric for *each type* within the radius ---
                for i, index in enumerate(valid_indices):
                    metric = metrics_df.iloc[index]
                    metric_lat = metric['latitude']
                    metric_lon = metric['longitude']
                    metric_type = metric['metric_type']
                    metric_score = metric['score']

                    # Calculate actual distance (or use distances[i] if metric is Euclidean)
                    # Recalculating Haversine is safer
                    dist_km = calculate_distance_km(acc_lat, acc_lon, metric_lat, metric_lon)

                    # Only consider metrics within the defined radius for scoring
                    if dist_km > MAX_METRIC_DISTANCE_KM:
                        # Since indices are sorted by distance, we can potentially break early
                        # if distances[i] > MAX_METRIC_DISTANCE_KM (if using Euclidean distance from KDTree)
                        # With Haversine, we check all neighbors returned by KDTree query within the initial k
                        continue

                    # If we haven't found a metric of this type yet, or this one is closer
                    if metric_type not in closest_metrics_by_type or dist_km < closest_metrics_by_type[metric_type]['distance']:
                        closest_metrics_by_type[metric_type] = {
                            'score': metric_score,
                            'distance': dist_km
                        }
                        logger.debug(f"Acc {acc_id}: Found/Updated metric '{metric_type}' (Score: {metric_score}) at distance {dist_km:.3f}km for scoring.")


                # 6. Calculate overall score based on *found* metrics
                found_metric_types = set(closest_metrics_by_type.keys())
                overall_score = None # Default to None
                num_found_types = 0 # Initialize count

                if found_metric_types: # Calculate score if at least one metric type was found
                    total_score = sum(m['score'] for m in closest_metrics_by_type.values())
                    num_found_types = len(found_metric_types) # Calculate actual count here
                    average_score = total_score / num_found_types
                    overall_score = int(round(average_score * 10)) # Scale score 0-10 to 0-100
                    scores_calculated_count += 1 # Increment count of successful calculations

                    logger.debug(f"Acc {acc_id}: Found {num_found_types}/{len(REQUIRED_METRIC_TYPES)} types. Total={total_score}, Avg={average_score:.2f}, Overall={overall_score}")

                    # Log if not all required types were found (only for a limited number)
                    if num_found_types < len(REQUIRED_METRIC_TYPES):
                         missing_types = REQUIRED_METRIC_TYPES - found_metric_types
                         if missing_types_logged_count < MAX_MISSING_TYPE_LOGS:
                              logger.warning(f"Acc {acc_id}: Score based on {num_found_types}/{len(REQUIRED_METRIC_TYPES)} types. "
                                             f"Missing types within {MAX_METRIC_DISTANCE_KM}km: {', '.join(sorted(list(missing_types)))}")
                              missing_types_logged_count += 1
                         elif missing_types_logged_count == MAX_MISSING_TYPE_LOGS:
                              logger.warning(f"Acc {acc_id}: Score based on incomplete types (Further detailed logs suppressed).")
                              missing_types_logged_count += 1
                else:
                    # No metrics found within the radius
                    # num_found_types remains 0
                    no_metrics_found_count += 1
                    logger.warning(f"Acc {acc_id}: Score is NULL. No safety metrics found within {MAX_METRIC_DISTANCE_KM}km.")


                # 7. Append update, including block_id, score, metric count, and TARGET city ID
                updates_to_make.append({
                    'id': acc_id,
                    'overall_safety_score': overall_score,
                    'census_block_id': inferred_block_id, # Add inferred block ID
                    'city_id': target_city_id,           # Use the known target_city_id
                    'safety_metric_types_found': num_found_types if found_metric_types else None # Add count, or None if no types found
                })
                processed_count += 1

            except (ValueError, TypeError) as coord_err:
                 logger.warning(f"Skipping accommodation {acc.get('id', 'N/A')} in {city_name} due to invalid coordinates or data: {coord_err}")
            except Exception as calc_err:
                logger.error(f"Error calculating score for accommodation {acc.get('id', 'N/A')} in {city_name}: {calc_err}", exc_info=False) # Keep log concise

        logger.info(f"Processed {processed_count} accommodations for {city_name}.")
        logger.info(f"Calculated {scores_calculated_count} non-null overall scores.")
        if no_metrics_found_count > 0:
             logger.warning(f"{no_metrics_found_count} accommodations had NO safety metrics within {MAX_METRIC_DISTANCE_KM}km and received a NULL score.")

        if scores_calculated_count == 0 and processed_count > 0:
            logger.critical(f"CRITICAL: No non-null overall safety scores were calculated for any of the {processed_count} processed accommodations. Check metric availability and distance settings.")
        elif processed_count > 0 and scores_calculated_count < (processed_count - no_metrics_found_count):
             # This condition means some scores were calculated, but fewer than expected given the ones with no metrics nearby
             logger.warning(f"WARNING: Only {scores_calculated_count} non-null scores calculated out of {processed_count - no_metrics_found_count} accommodations that had *some* nearby metrics. Check 'Missing types' logs.")


        # 8. Batch update accommodations (payload is now correct)
        batch_size = 100 # Adjust batch size as needed
        total_updated = 0
        total_failed = 0
        logger.info(f"Starting batch updates for {len(updates_to_make)} accommodations in {city_name}...")

        for i in range(0, len(updates_to_make), batch_size):
            batch = updates_to_make[i:i + batch_size]
            batch_number = (i // batch_size) + 1
            logger.info(f"Updating accommodation batch {batch_number}/{math.ceil(len(updates_to_make) / batch_size)} ({len(batch)} records) for {city_name}")
            try:
                # Use .update() for each item - less efficient than bulk but handles errors individually
                updated_in_batch = 0
                failed_in_batch = 0
                for update_item in batch:
                    try:
                        # Prepare update payload
                        update_payload = {
                            'overall_safety_score': update_item['overall_safety_score'],
                            'census_block_id': update_item['census_block_id'],
                            'city_id': update_item['city_id'], # Pass the correct city_id
                            'safety_metric_types_found': update_item['safety_metric_types_found'] # Include the count
                        }

                        # Log the payload for one item per batch for debugging
                        if updated_in_batch == 0 and failed_in_batch == 0: # Log first attempt in batch
                             logger.debug(f"Attempting update for Acc {update_item['id']} with payload: {update_payload}")


                        result = supabase_client.table('accommodations') \
                                               .update(update_payload) \
                                               .eq('id', update_item['id']) \
                                               .execute()

                        # Basic check: Did the API call itself throw an error?
                        # Note: Supabase update might return success even if 0 rows matched the 'eq' filter.
                        # More robust checking could involve examining result.data if needed, but absence of error is usually sufficient.
                        if hasattr(result, 'error') and result.error:
                            logger.error(f"APIError on update for accommodation {update_item['id']} in {city_name}: {result.error}")
                            failed_in_batch += 1
                        else:
                            # Log success only periodically or if debugging
                            # logger.debug(f"Successfully updated accommodation {update_item['id']}")
                            updated_in_batch += 1

                    except APIError as update_err: # Catch specific PostgREST errors
                        logger.error(f"APIError during individual update for accommodation {update_item['id']} in {city_name}: {update_err}", exc_info=False)
                        failed_in_batch += 1
                    except Exception as generic_err: # Catch other unexpected errors
                         logger.error(f"Generic error during individual update for accommodation {update_item['id']} in {city_name}: {generic_err}", exc_info=False)
                         failed_in_batch += 1

                logger.info(f"Batch {batch_number} update attempt finished for {city_name}. Succeeded: {updated_in_batch}, Failed: {failed_in_batch}")
                total_updated += updated_in_batch
                total_failed += failed_in_batch

            except Exception as e: # Catch potential unexpected errors during the batch loop itself
                logger.error(f"Unexpected error processing accommodation scores batch {batch_number} for {city_name}: {e}", exc_info=True)
                # Estimate failure for the rest of the batch if the loop breaks
                remaining_in_batch = len(batch) - updated_in_batch - failed_in_batch
                total_failed += remaining_in_batch
                # Potentially break or continue depending on severity
                break # Stop processing further batches if a fundamental error occurs here

            # Add a small delay between batches if needed to avoid rate limiting
            time.sleep(0.1)

        logger.info(f"Finished accommodation score update for {city_name}. Total Attempted Updates: {len(updates_to_make)}, Succeeded: {total_updated}, Failed: {total_failed}")
        if total_failed > 0:
             logger.warning("Some accommodation updates failed. Check logs for details.")


    except Exception as e:
        logger.error(f"An error occurred during the accommodation score update process for {city_name}: {e}", exc_info=True)
    finally:
        logger.info(f"Accommodation score update process finished for {city_name}.")

def load_city_config(city_id: int) -> dict:
    """Loads the configuration JSON file for the given city ID."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_file_path = os.path.join(script_dir, f'../../config/cities/{city_id}.json')
    logger.info(f"Loading city configuration from: {config_file_path}")
    try:
        with open(config_file_path, 'r') as f:
            config_data = json.load(f)
        logger.info(f"Successfully loaded configuration for city ID: {city_id} ({config_data.get('city_name')})")
        # TODO: Add validation for required config fields here
        return config_data
    except FileNotFoundError:
        logger.error(f"Error: City configuration file not found for city_id {city_id} at {config_file_path}")
        sys.exit(1)
    except json.JSONDecodeError:
        logger.error(f"Error: Could not decode JSON from city config file: {config_file_path}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred loading city configuration: {e}")
        sys.exit(1)

def load_city_crime_mapping(city_config: dict) -> dict:
    """Loads the crime code mapping for the given city."""
    mapping_file_rel_path = city_config.get('crime_code_mapping_file')
    city_name = city_config.get('city_name', 'Unknown City')
    
    if not mapping_file_rel_path:
        logger.error(f"'crime_code_mapping_file' not specified in config for {city_name}.")
        # Return empty mapping or raise error? Let's return empty for now.
        return {}

    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Note: The path in the config (e.g., '../../config/mappings/...') 
    # is relative to the script's directory location
    mapping_file_abs_path = os.path.abspath(os.path.join(script_dir, mapping_file_rel_path))
    
    logger.info(f"Loading crime code mapping for {city_name} from: {mapping_file_abs_path}")
    try:
        with open(mapping_file_abs_path, 'r') as f:
            mapping_data = json.load(f)
        # TODO: Validate mapping_data structure (e.g., ensure keys are metric types and values are lists of codes)
        logger.info(f"Successfully loaded crime mapping for {city_name}.")
        return mapping_data
    except FileNotFoundError:
        logger.error(f"Error: Crime code mapping file not found for {city_name} at {mapping_file_abs_path}")
        return {}
    except json.JSONDecodeError:
        logger.error(f"Error: Could not decode JSON from crime mapping file: {mapping_file_abs_path}")
        return {}
    except Exception as e:
        logger.error(f"An unexpected error occurred loading crime mapping file for {city_name}: {e}")
        return {}

# --- Main Execution ---
def main(target_city_id: int, test_mode=False):
    start_time = datetime.now()
    logger.info(f"====== Starting Safety Metrics Processing run at {start_time.isoformat()} ======")
    logger.info(f"Mode: {'TEST' if test_mode else 'PRODUCTION'}")
    logger.info(f"Target City ID: {target_city_id}")

    try:
        # Load city-specific config based on target_city_id
        city_config = load_city_config(target_city_id)
        logger.info(f"Using configuration for city: {city_config['city_name']}")

        # Use config values where needed (example for neighbor radius)
        neighbor_radius = city_config.get('geospatial', {}).get('neighbor_radius_meters', NEIGHBOR_RADIUS_METERS) # Use default if not in config
        logger.info(f"Using neighbor radius: {neighbor_radius} meters")

        days_back = 360 # TODO: Potentially make this configurable per city
        max_records = 500000 # TODO: Potentially make this configurable per city
    if test_mode:
        logger.info("TEST MODE: Using smaller dataset parameters.")
        days_back = 30
        max_records = 5000

        logger.info(f"\n=== STEP 1: Fetching Crime Data ({days_back} days, max {max_records:,} records) ===")
        # TODO: Pass city-specific data source info from city_config to fetch_crime_data
        raw_crime_data = fetch_crime_data(city_config, days_back=days_back, max_records=max_records)
        if not raw_crime_data:
            logger.warning(f"No crime data fetched for city {target_city_id}. Pipeline stopped.")
            return

        logger.info(f"\n=== STEP 2: Processing and Mapping {len(raw_crime_data):,} Crime Records ===")
        # TODO: Pass city_config (esp. crime code mapping info) if needed for process_crime_data
        processed_df = process_crime_data(raw_crime_data, city_config)
        del raw_crime_data
        if processed_df is None or processed_df.empty:
            logger.error(f"Crime data processing failed or yielded no results for city {target_city_id}. Pipeline stopped.")
            return

        logger.info(f"\n=== STEP 3: Calculating Safety Metrics from {len(processed_df):,} Processed Records ===")
        # Pass target_city_id and potentially parts of city_config (like mapping file path) to calculate_metrics
        metrics_by_type = calculate_metrics(processed_df, target_city_id, city_config)
        del processed_df
        total_metrics = sum(len(m) for m in metrics_by_type.values())
        if total_metrics == 0:
            logger.warning(f"No safety metrics were generated for city {target_city_id}.")

        logger.info(f"Generated {total_metrics:,} total metrics across {len(metrics_by_type)} categories for city {target_city_id}.")

        logger.info("\n=== STEP 4: Uploading Metrics to Supabase ===")
        upload_metrics(metrics_by_type, test_mode=test_mode)

        # --- STEP 5: Update Accommodation Scores ---
        logger.info("\n=== STEP 5: Updating Scores, Block & City IDs for Accommodations ===")
        try:
            update_accommodation_safety_scores(supabase, target_city_id) # Pass target_city_id
        except Exception as score_update_err:
            logger.error(f"Failed to update accommodation scores for city {target_city_id}: {score_update_err}", exc_info=True)

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"\n====== Safety Metrics Processing COMPLETED for City ID: {target_city_id} ({city_config['city_name']}) ======")
        logger.info(f"Total execution time: {duration:.2f} seconds ({duration / 60.0:.2f} minutes)")

    except Exception as e:
        logger.critical(f"An unhandled error occurred in the main execution pipeline for city {target_city_id}: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process safety metrics for a specific city.")
    parser.add_argument("--city-id", type=int, required=True, help="The ID of the city to process (from the 'cities' table).")
    parser.add_argument("--test-mode", action="store_true", help="Run in test mode with smaller dataset parameters.")
    args = parser.parse_args()

    main(target_city_id=args.city_id, test_mode=args.test_mode) # Pass the parsed city_id