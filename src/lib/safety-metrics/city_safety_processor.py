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
# LA_APP_TOKEN = os.environ.get("LA_APP_TOKEN") # Removed - Loaded via city config

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials in .env file")
    sys.exit(1)

# LAPD API configuration (Removed - Handled in fetch_crime_data based on config)
# LAPD_DOMAIN = "data.lacity.org"
# LAPD_DATASET_ID = "2nrs-mtv8"

# Socrata Timeout (Keep as global default)
SOCRATA_TIMEOUT = 60 # Timeout in seconds for Socrata requests

# Geospatial configuration (Keep as global default)
NEIGHBOR_RADIUS_METERS = 400 # Radius for finding neighbors (e.g., 400m ~ 1/4 mile)

# Initialize clients
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    sys.exit(1)

# Removed global socrata client - will be initialized in fetch_crime_data

# Get the absolute path to the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
# Construct the path to the config file relative to the script directory
# Adjust the relative path (`../../config/`) if needed based on your project structure
config_path = os.path.join(script_dir, '../../config/safety_metrics_config.json')

# Load the entire config file
try:
    with open(config_path, 'r') as f:
        safety_config = json.load(f)
    
    # Extract metric definitions and city-specific mappings
    METRIC_DEFINITIONS = {item['id']: item for item in safety_config.get('metrics', [])}
    CITY_SPECIFIC_MAPPINGS = safety_config.get('city_specific_mappings', {})
    
    logger.info(f"Successfully loaded {len(METRIC_DEFINITIONS)} metric definitions from {config_path}")
    logger.info(f"Successfully loaded crime code mappings for {len(CITY_SPECIFIC_MAPPINGS)} cities from {config_path}")
    
    if not METRIC_DEFINITIONS:
        logger.error("No metric definitions found in the 'metrics' list.")
        sys.exit(1)
    if not CITY_SPECIFIC_MAPPINGS:
        logger.error("No city-specific mappings found under 'city_specific_mappings'.")
        sys.exit(1)
        
except FileNotFoundError:
    logger.error(f"Error: safety_metrics_config.json not found at {config_path}")
    sys.exit(1)
except json.JSONDecodeError:
    logger.error(f"Error: Could not decode JSON from {config_path}")
    sys.exit(1)
except Exception as e:
    logger.error(f"An unexpected error occurred loading safety_metrics_config: {e}")
    sys.exit(1)

# --- Define CRIME CODES and TIME FILTERS separately --- 
# (Removed - Now loaded from safety_config)

def calculate_metrics(processed_df, target_city_id, city_config):
    """Calculate all safety metrics for each relevant census block, pre-calculating neighbors."""
    if processed_df is None or processed_df.empty:
        logger.warning("No processed data available to calculate metrics.")
        return {}
    logger.info("Calculating safety metrics for census blocks.")

    results = {}
    # Use target_city_id consistently (removed redundant la_city_id)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)

    # --- Load City-Specific Mappings from Global Config --- 
    city_id_str = str(target_city_id) # Use string key for mapping lookup
    if city_id_str not in CITY_SPECIFIC_MAPPINGS:
        logger.error(f"Crime code mappings not found for city_id '{target_city_id}' in the global config.")
        return {}
    city_crime_codes = CITY_SPECIFIC_MAPPINGS[city_id_str]
    # city_name is fetched from city_config passed as argument
    logger.info(f"Using city-specific crime code mappings for {city_config.get('city_name', f'ID {target_city_id}')}")

    # --- Pre-calculate Neighbors (remains mostly the same) --- 
    neighbor_radius = city_config.get('geospatial', {}).get('neighbor_radius_meters', NEIGHBOR_RADIUS_METERS)
    logger.info(f"Pre-calculating neighbors within {neighbor_radius}m for all unique blocks...")
    neighbor_cache = {}
    # Use the primary key column 'census_block_pk' to get unique identifiers
    unique_block_ids_in_data = processed_df['census_block_pk'].unique()
    logger.info(f"Found {len(unique_block_ids_in_data)} unique blocks (by PK) with incidents to check for neighbors.")
    # Loop through unique blocks ONCE to fetch neighbors
    for block_id in tqdm(unique_block_ids_in_data, desc=f"Fetching neighbors for city {target_city_id}"):
        try:
            # *** IMPORTANT ASSUMPTION CHECK ***
            # Does find_block_neighbors_within_radius expect the primary key ('id') or the block_group_id?
            # Let's assume it expects the primary key (`id` from census_blocks) for now, matching the FK reference.
            neighbor_response = supabase.rpc('find_block_neighbors_within_radius', {
                'target_block_id': block_id, # Assuming this expects the PK
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
    # Use METRIC_DEFINITIONS loaded from the global config 
    for metric_type, metric_info in METRIC_DEFINITIONS.items(): 
        logger.info(f"--- Processing Metric: {metric_type} for city {target_city_id} ---")

        # Filter by city-specific crime codes (using the globally loaded mapping)
        if metric_type not in city_crime_codes:
            logger.warning(f"Metric type '{metric_type}' not found in crime code mapping for city {target_city_id}. Skipping.")
            continue
        relevant_codes = city_crime_codes[metric_type]
        if not relevant_codes:
             logger.info(f"No crime codes defined for metric '{metric_type}' in city {target_city_id}. Skipping.")
             results[metric_type] = []
             continue
        
        metric_crimes_df = processed_df[processed_df['crime_code'].isin(relevant_codes)].copy()

        # Apply time filter if defined in the *global* metric definition
        time_filter_hours = metric_info.get('time_filter') # Use .get() for safety
        # --- Check for NYC dataset ID before applying time filter ---
        dataset_id = city_config.get('crime_data', {}).get('dataset_id')
        skip_time_filter = dataset_id == "uip8-fykc" # NYC Arrest Data dataset ID
        # --- End Check ---

        if time_filter_hours and isinstance(time_filter_hours, list):
            if skip_time_filter:
                 logger.warning(f"Skipping time filter for metric '{metric_type}' in city {target_city_id} (Dataset: {dataset_id}) due to known timestamp issues.")
            else:
                try:
                    initial_count = len(metric_crimes_df)
                    # Ensure 'hour' column exists and is numeric before filtering
                    if 'hour' in metric_crimes_df.columns and pd.api.types.is_numeric_dtype(metric_crimes_df['hour']):
                        metric_crimes_df = metric_crimes_df[metric_crimes_df['hour'].isin(time_filter_hours)]
                        filtered_count = len(metric_crimes_df)
                        logger.info(f"Applied time filter for metric '{metric_type}' (Hours: {time_filter_hours}). Records reduced from {initial_count} to {filtered_count}.")
                    else:
                        logger.warning(f"Could not apply time filter for '{metric_type}': 'hour' column missing or not numeric.")
                except Exception as tf_err:
                    logger.error(f"Error applying time filter for metric '{metric_type}': {tf_err}. Check format in safety_metrics_config.json.")
                    # Decide: skip metric or proceed without time filter? Let's skip.
                    continue 
        elif time_filter_hours:
             logger.warning(f"Time filter for metric '{metric_type}' is defined but not a list: {time_filter_hours}. Skipping filter.")

        if metric_crimes_df.empty:
            logger.info(f"No relevant incidents found for metric '{metric_type}' in city {target_city_id} after code/time filtering.")
            results[metric_type] = []
            continue

        logger.info(f"Found {len(metric_crimes_df)} incidents for metric '{metric_type}' in city {target_city_id}.")

        # Aggregate incidents by the census block primary key ('census_block_pk')
        # Include other necessary fields
        block_group_stats = metric_crimes_df.groupby('census_block_pk').agg(
            # We also need the original block_group_id if we display it anywhere later
            block_group_identifier=('block_group_id', 'first'),
            direct_incidents=('crime_code', 'size'),
            latitude=('latitude', 'mean'), # Use standardized column name
            longitude=('longitude', 'mean'), # Use standardized column name
            population=('population', 'first'),
            housing_units=('housing_units', 'first'),
            population_density_proxy=('population_density_proxy', 'first')
        ).reset_index() # census_block_pk becomes a column

        logger.info(f"Aggregated stats for {len(block_group_stats)} census blocks for metric '{metric_type}' in city {target_city_id}.")

        # Create a map using the primary key for neighbor lookups
        # Note: Neighbors are found using block_group_id in the RPC, so we need a way to link back if needed
        # For weighted score calculation, we probably need incidents mapped by census_block_pk
        metric_incident_map_pk = block_group_stats.set_index('census_block_pk')['direct_incidents'].to_dict()

        metric_records = []
        # --- Loop through each block that has incidents for THIS metric ---
        # Fetch neighbors based on the 'block_group_identifier' (original block_group_id from census)
        for _, block_row in tqdm(block_group_stats.iterrows(), total=len(block_group_stats), desc=f"Calculating {metric_type} metrics for city {target_city_id}"):
            current_block_pk = block_row['census_block_pk'] # This is the PK for FK relationship
            # Use original block group ID for neighbor lookup if the RPC uses that
            original_block_group_id_for_neighbors = block_row['block_group_identifier']

            direct_incidents = block_row['direct_incidents']
            pop_density_proxy = block_row['population_density_proxy']
            population = block_row['population']

            # --- Neighbor Incident Calculation ---
            # Get neighbors using the *original* block group ID? Recheck RPC neighbor function input.
            # Assuming find_block_neighbors_within_radius takes the PK ('id' from census_blocks)
            neighbor_ids_pk = neighbor_cache.get(current_block_pk, []) # ASSUMPTION: neighbor_cache keys are census_block_pk

            # If neighbor_cache keys are original block_group_id:
            # neighbor_ids_original = neighbor_cache.get(original_block_group_id_for_neighbors, [])
            # We need a map from original_block_group_id back to pk to use metric_incident_map_pk
            # This adds complexity. Let's *assume* neighbor_cache uses the PK ('id') for now.

            neighbor_incident_map = {
                nid_pk: metric_incident_map_pk.get(nid_pk, 0)
                for nid_pk in neighbor_ids_pk if nid_pk in metric_incident_map_pk
            }
            neighbor_count = len(neighbor_ids_pk) # Count neighbors by PK

            # --- End Neighbor Incident Calculation ---

            weighted_incidents = calculate_weighted_incidents(direct_incidents, neighbor_incident_map, pop_density_proxy)
            score = calculate_safety_score(weighted_incidents)
            incidents_per_1000 = (direct_incidents / population) * 1000 if population > 0 else 0.0

            description = get_risk_description(
                metric_type, score, direct_incidents, weighted_incidents, pop_density_proxy, incidents_per_1000, neighbor_count
            )

            # Use target_city_id and the *block primary key* for the stable metric ID
            # Use original block group id for display/logging if needed?
            id_string = f"{target_city_id}:{current_block_pk}:{metric_type}"
            stable_metric_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, id_string))

            geom_string = f"SRID=4326;POINT({block_row['longitude']} {block_row['latitude']})"

            metric_record = {
                'id': stable_metric_id,
                'city_id': target_city_id, # Use target_city_id
                # Use the PK ('census_block_pk') for the FK column in safety_metrics
                'block_group_id': current_block_pk, # <<< Use PK for the FK column
                'latitude': float(block_row['latitude']),
                'longitude': float(block_row['longitude']),
                'geom': geom_string,
                'metric_type': metric_type,
                'score': score, # Keep score as float to match NUMERIC type in DB
                'question': metric_info['question'], # From global METRIC_DEFINITIONS
                'description': description, # Generated, uses base from METRIC_DEFINITIONS
                'direct_incidents': int(direct_incidents),
                'weighted_incidents': float(weighted_incidents),
                'population_density': float(pop_density_proxy),
                'incidents_per_1000': float(incidents_per_1000),
                'created_at': now.isoformat(),
                'expires_at': expires_at.isoformat()
                # Consider adding 'block_group_identifier': block_row['block_group_identifier'] if needed for display
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
    TARGET_CITY_ID_FOR_METRIC_FETCH = target_city_id

    # --- Get City Name Early --- moved from inside try block
    city_name = "Unknown City"
    try:
        city_info = supabase_client.table('cities').select('name').eq('id', target_city_id).single().execute()
        if city_info.data:
            city_name = city_info.data.get('name', f"ID {target_city_id}")
        else:
            logger.warning(f"Could not fetch city name for ID: {target_city_id}")
            city_name = f"ID {target_city_id} (Error)"
    except Exception as city_fetch_err:
        logger.error(f"Error fetching city name for ID {target_city_id}: {city_fetch_err}")
        city_name = f"ID {target_city_id} (Error)"
    # --- End Get City Name ---
    
    logger.info(f"Target City: {city_name} (ID: {target_city_id})")
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
                # Use .update() for each item - less efficient but handles errors individually
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

# --- fetch_crime_data Implementation (Updated) ---
def fetch_crime_data(city_config: dict, days_back: int, max_records: int) -> list:
    """
    Fetches crime data from the source specified in the city configuration.
    Currently supports 'socrata' source type.
    """
    city_name = city_config.get('city_name', 'Unknown City')
    crime_data_config = city_config.get('crime_data', {})
    source_type = crime_data_config.get('source_type')

    if source_type != 'socrata':
        logger.error(f"Unsupported crime data source_type '{source_type}' for {city_name}. Only 'socrata' is supported.")
        return []

    domain = crime_data_config.get('api_domain')
    dataset_id = crime_data_config.get('dataset_id')
    app_token_var = crime_data_config.get('app_token_env_var')
    app_token = os.environ.get(app_token_var) if app_token_var else None

    if not domain or not dataset_id:
        logger.error(f"Missing 'api_domain' or 'dataset_id' in crime_data config for {city_name}.")
        return []

    if app_token_var and not app_token:
        logger.warning(f"App token environment variable '{app_token_var}' not found for {city_name}. Proceeding without token (may have lower rate limits).")
    elif app_token:
        logger.info(f"Using Socrata app token for {city_name} from env var '{app_token_var}'.")

    try:
        logger.info(f"Initializing Socrata client for {city_name} (Domain: {domain}, Timeout: {SOCRATA_TIMEOUT}s)")
        client = Socrata(domain, app_token, timeout=SOCRATA_TIMEOUT)
    except Exception as e:
        logger.error(f"Failed to initialize Socrata client for {city_name}: {e}")
        return []

    # --- Date Filtering ---
    try:
        start_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.000') # Socrata SoQL format

        # --- Dataset Specific Columns & Filters ---
        # Define required fields for each known dataset
        dataset_fields = {
            "2nrs-mtv8": { # LAPD
                "date": "date_occ",
                "time": "time_occ",
                "code": "crm_cd",
                "lat": "lat",
                "lon": "lon"
            },
            "uip8-fykc": { # New NYPD Arrest Data
                "date": "arrest_date",
                "time": None, # No separate time field
                "code": "ky_cd",
                "lat": "latitude",
                "lon": "longitude"
            }
            # Add other dataset IDs here if needed
        }

        if dataset_id not in dataset_fields:
            logger.error(f"Unknown dataset_id '{dataset_id}' for {city_name}. Cannot determine required fields.")
            return []

        fields = dataset_fields[dataset_id]
        date_field = fields["date"]
        select_columns_list = [f for f in fields.values() if f is not None] # Only select non-null fields
        select_columns = ", ".join(select_columns_list)
        
        # Basic date filter - add more specific filters if needed
        where_clause = f"{date_field} >= '{start_date_str}'"
        # Add lat/lon non-null filter for robustness
        if fields["lat"] and fields["lon"]:
             where_clause += f" AND {fields['lat']} IS NOT NULL AND {fields['lon']} IS NOT NULL"
             # Optionally add != 0 filters if needed for specific datasets
             # where_clause += f" AND {fields['lat']} != '0' AND {fields['lon']} != '0'"

        logger.info(f"Querying {city_name} ({dataset_id}) for records since {start_date_str}")
        logger.info(f"Selecting columns: {select_columns}")
        logger.info(f"WHERE clause: {where_clause}")

        logger.info(f"Fetching up to {max_records:,} records...")
        results = client.get(dataset_id,
                             select=select_columns,
                             where=where_clause,
                             limit=max_records)
        logger.info(f"Fetched {len(results):,} raw crime records for {city_name} from {domain}.")
        return results

    except requests.exceptions.Timeout:
        logger.error(f"Socrata API request timed out after {SOCRATA_TIMEOUT} seconds for {city_name} ({dataset_id}).")
        return []
    except Exception as e:
        logger.error(f"Error fetching Socrata data for {city_name} ({dataset_id}): {e}")
        if hasattr(client, 'last_response') and client.last_response:
             logger.error(f"Socrata Response Status: {client.last_response.status_code}")
             logger.error(f"Socrata Response Text: {client.last_response.text[:500]}...") 
        return []

# --- process_crime_data Implementation (Updated) ---
def process_crime_data(raw_crime_data: list, city_config: dict) -> pd.DataFrame | None:
    """
    Processes raw crime data:
    1. Converts to DataFrame.
    2. Standardizes columns based on dataset ID.
    3. Cleans data (types, missing values, lat/lon).
    4. Parses datetime and extracts hour.
    5. Matches coordinates to census blocks via Supabase RPC.
    6. Calculates population density proxy.
    Returns a processed DataFrame or None if processing fails.
    """
    city_name = city_config.get('city_name', 'Unknown City')
    dataset_id = city_config.get('crime_data', {}).get('dataset_id')
    logger.info(f"Processing {len(raw_crime_data):,} raw records for {city_name} (Dataset: {dataset_id})...")

    if not raw_crime_data:
        logger.warning(f"No raw crime data provided for {city_name}. Skipping processing.")
        return pd.DataFrame() # Return empty dataframe

    try:
        df = pd.DataFrame(raw_crime_data)
        logger.info(f"Converted raw data to DataFrame with {len(df)} rows.")

        # --- Define field mappings based on dataset ID --- 
        # Standardized internal names: 'crime_code', 'latitude', 'longitude', 'date_str', 'time_str'
        field_mapping = {
             "2nrs-mtv8": { # LAPD
                'crime_code': 'crm_cd',
                'latitude': 'lat',
                'longitude': 'lon',
                'date_str': 'date_occ',
                'time_str': 'time_occ'
            },
            "uip8-fykc": { # New NYPD Arrest Data
                'crime_code': 'ky_cd',
                'latitude': 'latitude',
                'longitude': 'longitude',
                'date_str': 'arrest_date',
                'time_str': None # Mark time as unavailable
            }
            # Add other dataset mappings here
        }

        if dataset_id not in field_mapping:
             logger.error(f"Dataset ID '{dataset_id}' not recognized for column standardization in {city_name}.")
             return None

        mapping = field_mapping[dataset_id]
        rename_map = {v: k for k, v in mapping.items() if v is not None} # Map source -> standard
        required_source_cols = [v for v in mapping.values() if v is not None] # List of source columns needed
        standard_cols_expected = list(rename_map.values()) # List of standard columns after rename

        # Check if required source columns exist in the DataFrame
        missing_source_cols = [col for col in required_source_cols if col not in df.columns]
        if missing_source_cols:
            logger.error(f"Missing required source columns in raw data for {city_name} ({dataset_id}): {missing_source_cols}")
            return None
        
        # Select only required source columns and rename to standard names
        df = df[required_source_cols].rename(columns=rename_map)
        logger.info(f"Standardized columns. DataFrame shape: {df.shape}, Columns: {df.columns.tolist()}")

        # --- Data Cleaning & Type Conversion ---
        # Convert lat/lon to numeric, dropping invalid rows
        df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
        df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
        df = df[(df['latitude'].notna()) & (df['longitude'].notna()) & (df['latitude'] != 0) & (df['longitude'] != 0)]
        logger.info(f"Cleaned lat/lon. Rows remaining: {len(df)}")

        if df.empty:
             logger.warning(f"No valid records after lat/lon cleaning for {city_name}.")
             return df

        # Convert crime_code to string
        df['crime_code'] = df['crime_code'].astype(str)

        # --- Datetime Parsing ---        
        def parse_datetime(row):
            try:
                # Ensure date_str exists and is not null before proceeding
                if 'date_str' not in row or pd.isna(row['date_str']):
                    return pd.NaT
                
                date_str_full = str(row['date_str'])

                # --- Handle NYC dataset ("uip8-fykc") specifically ---
                if dataset_id == "uip8-fykc":
                    # The date_str field contains the full timestamp
                    dt_obj = pd.to_datetime(date_str_full, errors='coerce')
                    # If timezone info is missing, assume UTC. If present, convert to UTC.
                    if dt_obj is not pd.NaT:
                        if dt_obj.tzinfo is None:
                            dt_obj = dt_obj.tz_localize('UTC')
                        else:
                            dt_obj = dt_obj.tz_convert('UTC')
                    return dt_obj
                # --- End NYC specific handling ---
                    
                # --- Original logic for other datasets (like LAPD) ---
                date_part = date_str_full.split('T')[0] # Get YYYY-MM-DD
                time_part_input = row.get('time_str') # Use .get() as time_str might not exist
                
                # Default time if not available or invalid
                parsed_time = "12:00:00" # Default to midday if no time info
                log_time_default = False
                
                if time_part_input is not None and pd.notna(time_part_input):
                    time_str = str(time_part_input)
                    if dataset_id == "2nrs-mtv8": # LAPD HHMM format
                         time_str = time_str.zfill(4)
                         if len(time_str) == 4 and time_str.isdigit():
                            hour = int(time_str[:2])
                            minute = int(time_str[2:])
                            # Handle potential '2400' by setting to 23:59
                            if hour >= 24:
                                 hour = 23
                                 minute = 59
                            parsed_time = f"{hour:02d}:{minute:02d}:00"
                         else:
                              log_time_default = True # Invalid format
                    else: # Assume HH:MM:SS format for others, handle '24:' prefix
                         if len(time_str.split(':')) == 3:
                            if time_str.startswith('24:'):
                                 parsed_time = '23:59:59'
                            else:
                                 # Basic validation (can be improved)
                                 try: 
                                      t = datetime.strptime(time_str, '%H:%M:%S').time()
                                      parsed_time = time_str
                                 except ValueError:
                                      log_time_default = True # Invalid time
                         else:
                             log_time_default = True # Invalid format
                else:
                     log_time_default = True # Time field missing or null
                     
                if log_time_default:
                     # Log only once per run? Or sample? Avoid flooding logs.
                     # logger.debug(f"Invalid or missing time_str '{time_part_input}', defaulting to {parsed_time} for date {date_part}")
                     pass # Decide on logging strategy
                
                dt_str = f"{date_part} {parsed_time}"
                # Use default timezone UTC if not specified
                # errors='coerce' handles cases where dt_str is still invalid after parsing attempts
                dt_obj = pd.to_datetime(dt_str, errors='coerce').tz_localize('UTC') 
                return dt_obj
            except Exception as e:
                # logger.warning(f"Could not parse datetime: date='{row.get('date_str', 'N/A')}', time='{row.get('time_str', 'N/A')}', Error: {e}")
                return pd.NaT

        logger.info("Parsing datetime columns...")
        # Create temporary columns to avoid SettingWithCopyWarning
        df['datetime_occ'] = df.apply(parse_datetime, axis=1)
        df = df.dropna(subset=['datetime_occ']) # Drop rows where datetime parsing failed
        df['hour'] = df['datetime_occ'].dt.hour
        logger.info(f"Parsed datetime and extracted hour. Rows remaining: {len(df)}")
        
        # Keep only needed columns before expensive RPC call
        final_cols_before_rpc = ['crime_code', 'latitude', 'longitude', 'hour']
        # Ensure all expected columns exist, even if time wasn't parsed correctly (hour defaulted)
        df = df[[col for col in final_cols_before_rpc if col in df.columns]].copy()

        if df.empty:
             logger.warning(f"No valid records remaining after cleaning for {city_name}.")
             return df # Return empty DataFrame

        # --- Geospatial Mapping via Supabase RPC ---
        logger.info(f"Starting geospatial mapping for {len(df)} records...")
        coordinates = df[['latitude', 'longitude']].to_dict('records')
        # Rename keys for the RPC function if needed (assuming it expects 'lat', 'lon')
        coordinates_rpc = [{'lat': c['latitude'], 'lon': c['longitude']} for c in coordinates]

        block_data = []
        try:
            # Initialize block_df to None outside the conditional blocks
            block_df = None

            # Call the RPC function
            logger.info(f"Calling Supabase RPC 'match_points_to_block_groups'...")
            rpc_response = supabase.rpc('match_points_to_block_groups', {'points_json': coordinates_rpc}).execute()

            # Check if data was returned, regardless of length for now
            if rpc_response.data:
                if len(rpc_response.data) != len(coordinates_rpc):
                    # Log a more critical warning about the mismatch
                    logger.error(f"CRITICAL WARNING: RPC response length mismatch! Received {len(rpc_response.data)} results for {len(coordinates_rpc)} coordinates. Processing received data but results may be misaligned or incomplete.")
                else:
                     logger.info(f"Successfully received {len(rpc_response.data)} results from RPC matching input length.")

                # --- Process RPC response manually (handles nulls, correct keys, and potential length mismatch) ---
                processed_block_data = []
                # Iterate through the actual response data received
                for item in rpc_response.data:
                    if item is not None and isinstance(item, dict):
                        processed_block_data.append({
                            # Capture the primary key 'id' returned by the RPC
                            'census_block_pk': item.get('id'), # <<< Extract the 'id' field
                            'block_group_id': item.get('block_group_id'),
                            'population': item.get('total_population'),
                            'housing_units': item.get('housing_units')
                        })
                    else:
                        processed_block_data.append({
                            'census_block_pk': None, # <<< Add None for PK
                            'block_group_id': None, 'population': None, 'housing_units': None
                        })

                # Create block_df from the processed data
                block_df = pd.DataFrame(processed_block_data)
                logger.info(f"Created block_df from processed RPC data. Shape: {block_df.shape}, Columns: {block_df.columns.tolist()}")

                # >>> ADD LOGGING HERE <<<
                logger.info(f"Block DF Head (from RPC):\n{block_df.head()}")
                # >>> END LOGGING <<<

                # No longer need to rename block_group_id to census_block_id
                # Keep both census_block_pk (the primary key for FK) and block_group_id (original identifier)

                # if 'block_group_id' in block_df.columns:
                #      block_df.rename(columns={'block_group_id': 'census_block_id'}, inplace=True)
                #      logger.info(f"Renamed 'block_group_id' to 'census_block_id'.")
                # else:
                #      logger.warning("Column 'block_group_id' not found in processed RPC data, skipping rename.")

            elif hasattr(rpc_response, 'error') and rpc_response.error:
                 logger.error(f"Supabase RPC error: {rpc_response.error}")
                 # Handle error - perhaps return None or empty DataFrame?
                 return None
            # If block_df is still None here, it means RPC returned no data and no error
            if block_df is None:
                 logger.error("RPC call 'match_points_to_block_groups' returned no data and no error. Cannot proceed.")
                 return None

        except APIError as api_err: # Catch specific PostgREST errors separately
             logger.error(f"Supabase RPC APIError for 'match_points_to_block_groups': {api_err}", exc_info=False)
             # Log details from the error if available
             if hasattr(api_err, 'details') and api_err.details:
                  logger.error(f"APIError Details: {api_err.details}")
             if hasattr(api_err, 'hint') and api_err.hint:
                  logger.error(f"APIError Hint: {api_err.hint}")
             return None
        except Exception as rpc_err:
            logger.error(f"Error processing Supabase RPC 'match_points_to_block_groups': {rpc_err}", exc_info=True)
            # Handle error - perhaps return None or empty DataFrame?
            return None

        # Check which columns were successfully created before merging
        valid_block_cols = [col for col in ['census_block_pk', 'block_group_id', 'population', 'housing_units'] if col in block_df.columns]
        logger.info(f"Columns ready for merging from block_df: {valid_block_cols}")

        if not valid_block_cols:
            logger.error("Failed to extract any valid block data columns from RPC response.")
            return None

        # Merge based on index - IMPORTANT assumption that order is maintained
        df = pd.concat([df.reset_index(drop=True), block_df[valid_block_cols].reset_index(drop=True)], axis=1)
        logger.info(f"Merged census block data. DataFrame shape: {df.shape}, Columns: {df.columns.tolist()}")

        # Drop rows where census_block_pk is null (failed mapping)
        initial_rows = len(df)
        # Ensure 'census_block_pk' column actually exists before dropping NAs
        if 'census_block_pk' in df.columns:
            df.dropna(subset=['census_block_pk'], inplace=True)
            rows_after_drop = len(df)
            if initial_rows > rows_after_drop:
                logger.info(f"Dropped {initial_rows - rows_after_drop} records that failed census block mapping (PK).")
        else:
            logger.warning("Column 'census_block_pk' not found after merge, skipping dropna step.")

        if df.empty:
             logger.warning(f"No records remaining after census block mapping for {city_name}.")
             return df

        # --- Data Type Conversion & Final Calculations ---
        # Convert population and housing units to numeric, coercing errors
        df['population'] = pd.to_numeric(df['population'], errors='coerce').fillna(0).astype(int)
        df['housing_units'] = pd.to_numeric(df['housing_units'], errors='coerce').fillna(0).astype(int)

        # Calculate population density proxy (Population / Housing Units)
        # Avoid division by zero
        df['population_density_proxy'] = df.apply(
            lambda row: row['population'] / row['housing_units'] if row['housing_units'] > 0 else 0,
            axis=1
        )
        logger.info("Calculated population density proxy.")

        # Final column selection and type check
        final_cols = [
            'crime_code', 'latitude', 'longitude', 'hour',
            'census_block_pk', 'block_group_id', # Keep both PK and original ID
            'population', 'housing_units', 'population_density_proxy'
        ]
        # Ensure all final columns exist before returning
        processed_df = df[[col for col in final_cols if col in df.columns]]
        logger.info(f"Processing complete for {city_name}. Final DataFrame shape: {processed_df.shape}")
        return processed_df

    except Exception as e:
        logger.error(f"An unexpected error occurred during process_crime_data for {city_name}: {e}", exc_info=True)
        return None

# --- Real upload_metrics Implementation ---
def upload_metrics(metrics_by_type: dict, target_city_id: int, test_mode=False):
    """
    Uploads the calculated safety metrics to the Supabase table.
    Deletes existing metrics for the target city before inserting new ones (if not in test mode).
    """
    all_metrics = []
    for metrics_list in metrics_by_type.values():
        all_metrics.extend(metrics_list)

    total_metrics = len(all_metrics)
    logger.info(f"Prepared {total_metrics:,} total metrics for city ID {target_city_id} to upload.")

    if total_metrics == 0:
        logger.info(f"No metrics to upload for city ID {target_city_id}.")
        # Optionally, still delete old metrics if desired
        # if not test_mode: ... delete logic ... 
        return

    if test_mode:
        logger.info(f"[TEST MODE] Would upload {total_metrics:,} metrics for city ID {target_city_id}. Skipping database operations.")
        return

    # --- Production Mode: Delete and Upload ---
    try:
        # 1. Delete existing metrics for the target city
        logger.info(f"Deleting existing safety metrics for city_id {target_city_id}...")
        delete_result = supabase.table('safety_metrics').delete().eq('city_id', target_city_id).execute()
        # Supabase delete doesn't directly return count, but we can log success/failure
        if hasattr(delete_result, 'error') and delete_result.error:
             logger.error(f"Error deleting existing metrics for city {target_city_id}: {delete_result.error}")
             # Decide whether to proceed with upload if delete fails. Let's stop here.
             return 
        else:
             # We don't know how many were deleted unless we count first, but log the action
             logger.info(f"Successfully sent delete request for existing metrics for city {target_city_id}.")
             # Note: Depending on RLS, this might not delete anything if run by a non-privileged user.

        # 2. Insert new metrics in batches
        batch_size = 100 # Adjust as needed
        total_inserted = 0
        total_failed = 0
        logger.info(f"Starting batch inserts for {total_metrics} new metrics...")
        
        city_name = supabase.table('cities').select('name').eq('id', target_city_id).single().execute().data.get('name', f'ID {target_city_id}')

        for i in range(0, total_metrics, batch_size):
            batch = all_metrics[i:i + batch_size]
            batch_number = (i // batch_size) + 1
            logger.info(f"Inserting metrics batch {batch_number}/{math.ceil(total_metrics / batch_size)} ({len(batch)} records) for {city_name}")
            try:
                insert_result = supabase.table('safety_metrics').insert(batch).execute()
                
                # Check for API level errors
                if hasattr(insert_result, 'error') and insert_result.error:
                    logger.error(f"APIError on insert batch {batch_number} for {city_name}: {insert_result.error}")
                    total_failed += len(batch)
                # Check for row-level errors (e.g., constraint violations) - Supabase python v1 might not expose these easily
                # Assuming success if no API error for now
                elif insert_result.data: # Check if data was returned (indicates success)
                    # Supabase v1 insert returns the inserted data. Count successful rows.
                    # Note: This might be less reliable than checking for errors directly if API changes.
                    inserted_in_batch = len(insert_result.data)
                    total_inserted += inserted_in_batch
                    if inserted_in_batch < len(batch):
                         failed_in_batch = len(batch) - inserted_in_batch
                         total_failed += failed_in_batch
                         logger.warning(f"Batch {batch_number} partially failed for {city_name}. Succeeded: {inserted_in_batch}, Failed: {failed_in_batch}")
                    # else: # Log full batch success periodically if needed
                    #    logger.debug(f"Batch {batch_number} inserted successfully.")
                else:
                     # If no data and no error, it might indicate nothing was inserted or an issue not reported via error attribute
                     logger.warning(f"Batch {batch_number} for {city_name} returned no data and no explicit error. Assuming failure for this batch.")
                     total_failed += len(batch)

            except APIError as api_err:
                 logger.error(f"APIError during insert batch {batch_number} for {city_name}: {api_err}", exc_info=False)
                 total_failed += len(batch) # Assume whole batch failed on APIError
            except Exception as e:
                logger.error(f"Unexpected error during insert batch {batch_number} for {city_name}: {e}", exc_info=True)
                total_failed += len(batch) # Assume whole batch failed
            
            time.sleep(0.1) # Small delay between batches

        logger.info(f"Finished metrics upload for {city_name}. Total Inserted: {total_inserted}, Total Failed: {total_failed}")
        if total_failed > 0:
             logger.warning("Some metric inserts failed. Check logs for details.")

    except Exception as e:
        logger.error(f"An unexpected error occurred during upload_metrics for city {target_city_id}: {e}", exc_info=True)

# --- Real calculate_weighted_incidents Implementation ---
def calculate_weighted_incidents(direct_incidents: int, neighbor_incident_map: dict, pop_density_proxy: float) -> float:
    """
    Calculates a weighted incident count for a block.
    Considers direct incidents and a fraction of neighbor incidents.
    (Note: pop_density_proxy is passed but not used in this specific calculation, 
     it's used later in score interpretation/description).
    """
    neighbor_incidents_total = sum(neighbor_incident_map.values())
    
    # Simple weighting: Direct incidents + 0.5 * Neighbor incidents
    # Adjust the 0.5 factor based on desired neighbor influence
    NEIGHBOR_WEIGHT = 0.5 
    weighted_score = float(direct_incidents) + NEIGHBOR_WEIGHT * neighbor_incidents_total
    # logger.debug(f"Weighted incidents: {direct_incidents} direct + {NEIGHBOR_WEIGHT} * {neighbor_incidents_total} neighbors = {weighted_score}")
    return weighted_score

# --- Real calculate_safety_score Implementation ---
def calculate_safety_score(weighted_incidents: float) -> float:
    """
    Calculates a safety score (0-10) based on weighted incidents.
    Higher score indicates lower risk (fewer weighted incidents).
    Maps 0 incidents to score 10, increasing incidents decrease score.
    """
    # Inverse relationship: Score decreases as incidents increase.
    # The multiplier controls sensitivity. 0.5 means 20 weighted incidents -> score 0.
    # Adjust this based on desired score distribution.
    SCORE_SENSITIVITY_MULTIPLIER = 0.5 
    
    score = 10.0 - (weighted_incidents * SCORE_SENSITIVITY_MULTIPLIER)
    
    # Clamp score between 0 and 10
    final_score = max(0.0, min(10.0, score))
    # logger.debug(f"Calculated safety score: {final_score:.2f} from {weighted_incidents:.2f} weighted incidents.")
    return final_score

# --- Real calculate_distance_km Implementation ---
def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) using Haversine formula.
    """
    # Convert decimal degrees to radians 
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])

    # Haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers. Use 3956 for miles
    return c * r

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

        days_back = 100
        max_records = 500000
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
        # Pass target_city_id to upload_metrics
        upload_metrics(metrics_by_type, target_city_id=target_city_id, test_mode=test_mode)

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