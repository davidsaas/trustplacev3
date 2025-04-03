#!/usr/bin/env python3
"""
City Safety Metrics Processor - Refactored Implementation
Processes crime data, calculates safety metrics for census blocks,
and updates accommodation safety scores.
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

# --- Basic Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Script directory for loading local configs
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Constants ---
SOCRATA_TIMEOUT = 60  # Timeout in seconds for Socrata API requests
DEFAULT_NEIGHBOR_RADIUS_METERS = 400 # Default radius for finding neighbors
DEFAULT_NEIGHBOR_BATCH_SIZE = 30 # Smaller batch size for neighbor RPC
GEO_MAPPING_BATCH_SIZE = 20000 # Batch size for coordinate-to-block mapping RPC
METRIC_UPLOAD_BATCH_SIZE = 100 # Batch size for uploading safety_metrics
ACCOMMODATION_UPDATE_BATCH_SIZE = 500 # Batch size for updating accommodations
METRIC_EXPIRY_DAYS = 90 # How long metrics are considered valid
MAX_ACCOMMODATION_METRIC_DISTANCE_KM = 4.0 # Max distance to link accommodations to metrics
NEIGHBOR_INCIDENT_WEIGHT = 0.25 # Weighting factor for neighbor incidents in score
SCORE_DECAY_CONSTANT_K = 0.005 # Decay factor for calculating score from weighted incidents

# --- Initialize Supabase Client ---
supabase: Client | None = None
try:
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) in .env file")
        sys.exit(1)
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}", exc_info=True)
    sys.exit(1)

# --- Global Configuration Storage ---
METRIC_DEFINITIONS = {}
CITY_SPECIFIC_MAPPINGS = {}

# --- Configuration Loading Functions ---
def load_global_config():
    """Loads the main safety metrics definitions and mappings from the JSON config."""
    global METRIC_DEFINITIONS, CITY_SPECIFIC_MAPPINGS
    config_path = os.path.join(SCRIPT_DIR, '../../config/safety_metrics_config.json')
    logger.info(f"Loading global safety config from: {config_path}")
    try:
        with open(config_path, 'r') as f:
            safety_config = json.load(f)

        METRIC_DEFINITIONS = {item['id']: item for item in safety_config.get('metrics', [])}
        CITY_SPECIFIC_MAPPINGS = safety_config.get('city_specific_mappings', {})

        if not METRIC_DEFINITIONS:
            logger.error("No metric definitions found in 'metrics' list in global config.")
            sys.exit(1)
        if not CITY_SPECIFIC_MAPPINGS:
            logger.error("No city-specific mappings found under 'city_specific_mappings' in global config.")
            sys.exit(1)

        logger.info(f"Loaded {len(METRIC_DEFINITIONS)} metric definitions and mappings for {len(CITY_SPECIFIC_MAPPINGS)} cities.")

    except FileNotFoundError:
        logger.error(f"Global safety config file not found at {config_path}")
        sys.exit(1)
    except json.JSONDecodeError:
        logger.error(f"Error decoding JSON from global config file: {config_path}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error loading global safety config: {e}", exc_info=True)
        sys.exit(1)

def load_city_config(city_id: int) -> dict:
    """Loads the city-specific configuration file."""
    config_file_path = os.path.join(SCRIPT_DIR, f'../../config/cities/{city_id}.json')
    logger.info(f"Loading city configuration from: {config_file_path}")
    try:
        with open(config_file_path, 'r') as f:
            config_data = json.load(f)
        
        # Basic validation (add more as needed)
        if 'city_name' not in config_data or 'crime_data' not in config_data:
             logger.error(f"City config for {city_id} is missing required fields ('city_name', 'crime_data').")
             sys.exit(1)

        logger.info(f"Successfully loaded configuration for city ID: {city_id} ({config_data.get('city_name')})")
        return config_data
    except FileNotFoundError:
        logger.error(f"City configuration file not found for city_id {city_id} at {config_file_path}")
        sys.exit(1)
    except json.JSONDecodeError:
        logger.error(f"Error decoding JSON from city config file: {config_file_path}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred loading city configuration for {city_id}: {e}", exc_info=True)
        sys.exit(1)

# --- Helper Functions ---

def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points
    on the earth (specified in decimal degrees) using Haversine formula.
    Returns distance in kilometers.
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    r_km = 6371 # Radius of earth in kilometers
    return c * r_km

# --- Core Logic Functions ---

def fetch_crime_data(city_config: dict, days_back: int, max_records: int) -> list:
    """
    Fetches raw crime data from the source specified in the city configuration.
    Currently supports Socrata API.
    """
    city_name = city_config.get('city_name', 'Unknown City')
    crime_data_config = city_config.get('crime_data', {})
    source_type = crime_data_config.get('source_type')

    if source_type != 'socrata':
        logger.error(f"Unsupported crime data source_type '{source_type}' for {city_name}. Only 'socrata' is supported.")
        return []

    # --- Socrata Specific Logic ---
    domain = crime_data_config.get('api_domain')
    dataset_id = crime_data_config.get('dataset_id')
    app_token_var = crime_data_config.get('app_token_env_var')
    app_token = os.environ.get(app_token_var) if app_token_var else None

    if not domain or not dataset_id:
        logger.error(f"Missing 'api_domain' or 'dataset_id' in crime_data config for {city_name}.")
        return []

    if app_token_var and not app_token:
        logger.warning(f"Socrata app token env var '{app_token_var}' defined but not found for {city_name}. Proceeding without token (may have lower rate limits).")
    elif app_token:
        logger.info(f"Using Socrata app token for {city_name} from env var '{app_token_var}'.")
    else:
        logger.info(f"No Socrata app token configured for {city_name}. Proceeding without token.")

    # Initialize Socrata client for this request
    try:
        logger.info(f"Initializing Socrata client for {city_name} (Domain: {domain}, Timeout: {SOCRATA_TIMEOUT}s)")
        socrata_client = Socrata(domain, app_token, timeout=SOCRATA_TIMEOUT)
    except Exception as e:
        logger.error(f"Failed to initialize Socrata client for {city_name}: {e}", exc_info=True)
        return []

    # --- Calculate Date Filter ---
    try:
        start_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        # Socrata SoQL format (YYYY-MM-DDTHH:MM:SS.fff)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.000')
    except Exception as date_err:
        logger.error(f"Error calculating start date: {date_err}")
        return []

    # --- Define Dataset Specific Fields and Filters ---
    # Map standard internal names to dataset-specific column names
    dataset_field_mappings = {
        "2nrs-mtv8": { # LAPD Crime Data
            "date_field": "date_occ",
            "time_field": "time_occ",
            "code_field": "crm_cd",
            "lat_field": "lat",
            "lon_field": "lon"
        },
        "uip8-fykc": { # NYPD Arrest Data
            "date_field": "arrest_date", # Contains full timestamp
            "time_field": None, # Time is part of the date field
            "code_field": "ky_cd", # Law Code Category
            "lat_field": "latitude",
            "lon_field": "longitude"
        }
        # Add mappings for other potential datasets here
    }

    if dataset_id not in dataset_field_mappings:
        logger.error(f"Unknown dataset_id '{dataset_id}' for {city_name}. Cannot determine required fields.")
        return []

    fields = dataset_field_mappings[dataset_id]
    date_field = fields["date_field"]
    lat_field = fields["lat_field"]
    lon_field = fields["lon_field"]

    # Build SELECT clause (only include fields that are not None)
    select_columns_list = [f for f in fields.values() if f is not None]
    select_clause = ", ".join(select_columns_list)

    # Build WHERE clause
    where_clause = f"{date_field} >= '{start_date_str}'"
    if lat_field and lon_field:
        # Add IS NOT NULL checks for coordinates
        where_clause += f" AND {lat_field} IS NOT NULL AND {lon_field} IS NOT NULL"
        # Add specific != '0' checks if necessary for certain datasets (optional)
        # e.g., if dataset_id == "2nrs-mtv8":
        #    where_clause += f" AND {lat_field} != '0' AND {lon_field} != '0'"

    # --- Execute Socrata Query ---
    try:
        logger.info(f"Querying {city_name} ({dataset_id}) for records since {start_date_str}")
        logger.info(f"  SELECT: {select_clause}")
        logger.info(f"  WHERE: {where_clause}")
        logger.info(f"  LIMIT: {max_records:,}")

        results = socrata_client.get(
            dataset_id,
            select=select_clause,
            where=where_clause,
            limit=max_records
        )
        logger.info(f"Successfully fetched {len(results):,} raw records from {domain} for {city_name}.")
        return results

    except requests.exceptions.Timeout:
        logger.error(f"Socrata API request timed out after {SOCRATA_TIMEOUT} seconds for {city_name} ({dataset_id}).")
        return []
    except APIError as sodapy_err: # Socrata library specific error
         logger.error(f"Socrata API error for {city_name} ({dataset_id}): {sodapy_err}")
         # Log response details if available
         if hasattr(socrata_client, 'last_response') and socrata_client.last_response:
             try:
                 status = socrata_client.last_response.status_code
                 text = socrata_client.last_response.text[:500] # Limit response text length
                 logger.error(f"  Socrata Response Status: {status}")
                 logger.error(f"  Socrata Response Text: {text}...")
             except Exception as resp_err:
                 logger.error(f"  Error accessing Socrata response details: {resp_err}")
         return []
    except Exception as e:
        logger.error(f"Unexpected error fetching Socrata data for {city_name} ({dataset_id}): {e}", exc_info=True)
        return []
    finally:
        # Close the Socrata client connection if possible (depends on library version)
        if hasattr(socrata_client, 'close'):
            try:
                socrata_client.close()
            except Exception as close_err:
                logger.warning(f"Error closing Socrata client: {close_err}")

def process_crime_data(raw_crime_data: list, city_config: dict) -> pd.DataFrame | None:
    """
    Processes raw crime data list into a cleaned pandas DataFrame.
    Steps include:
    1. Standardizing columns based on city_config.
    2. Cleaning data types (numeric coords, string codes).
    3. Parsing datetime and extracting hour.
    4. Matching coordinates to census blocks via batch Supabase RPC.
    5. Calculating population density proxy.
    """
    city_name = city_config.get('city_name', 'Unknown City')
    dataset_id = city_config.get('crime_data', {}).get('dataset_id')
    logger.info(f"Processing {len(raw_crime_data):,} raw records for {city_name} (Dataset: {dataset_id})...")

    if not raw_crime_data:
        logger.warning(f"No raw crime data provided for {city_name}. Returning empty DataFrame.")
        return pd.DataFrame()

    try:
        # 1. Convert to DataFrame
        df = pd.DataFrame(raw_crime_data)
        logger.info(f"Converted raw data to DataFrame with {len(df)} rows. Initial columns: {df.columns.tolist()}")

        # 2. Standardize Columns
        # Define standard internal names and map them to source names via city_config
        # (Using the same mapping structure as fetch_crime_data)
        dataset_field_mappings = {
            "2nrs-mtv8": { # LAPD
                'date_str': 'date_occ',
                'time_str': 'time_occ',
                'crime_code': 'crm_cd',
                'latitude': 'lat',
                'longitude': 'lon'
            },
            "uip8-fykc": { # NYPD Arrest Data
                'date_str': 'arrest_date',
                'time_str': None,
                'crime_code': 'ky_cd',
                'latitude': 'latitude',
                'longitude': 'longitude'
            }
            # Add other dataset mappings here
        }

        if dataset_id not in dataset_field_mappings:
             logger.error(f"Dataset ID '{dataset_id}' not recognized for column standardization in {city_name}.")
             return None

        mapping = dataset_field_mappings[dataset_id]
        rename_map = {v: k for k, v in mapping.items() if v is not None and v in df.columns}
        required_source_cols = [v for v in mapping.values() if v is not None]

        # Check for missing source columns that are needed
        missing_source_cols = [col for col in required_source_cols if col not in df.columns]
        if missing_source_cols:
            logger.error(f"Missing required source columns in raw data for {city_name} ({dataset_id}): {missing_source_cols}")
            return None

        # Select only needed columns and rename
        df = df[list(rename_map.keys())].rename(columns=rename_map)
        logger.info(f"Renamed columns to standard set: {df.columns.tolist()}")

        # 3. Clean Data Types and Coordinates
        initial_rows = len(df)
        df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
        df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
        # Drop rows with invalid or zero coordinates
        df.dropna(subset=['latitude', 'longitude'], inplace=True)
        df = df[(df['latitude'] != 0) & (df['longitude'] != 0)]
        rows_after_coord_clean = len(df)
        if initial_rows > rows_after_coord_clean:
            logger.info(f"Dropped {initial_rows - rows_after_coord_clean} rows due to invalid/zero coordinates.")

        if df.empty:
            logger.warning(f"No valid records remaining after coordinate cleaning for {city_name}.")
            return pd.DataFrame()

        # Ensure crime code is string
        if 'crime_code' in df.columns:
             df['crime_code'] = df['crime_code'].astype(str)
        else:
             logger.error(f"Standardized column 'crime_code' not found after renaming. Check mapping for dataset {dataset_id}.")
             return None

        # 4. Parse Datetime and Extract Hour
        logger.info("Parsing datetime information...")

        def parse_datetime_internal(row):
            try:
                date_str_val = row.get('date_str')
                if pd.isna(date_str_val):
                    return pd.NaT
                date_str_full = str(date_str_val)

                # Handle specific dataset formats
                if dataset_id == "uip8-fykc": # NYPD Arrest Data (contains timestamp)
                    dt_obj = pd.to_datetime(date_str_full, errors='coerce')
                    if dt_obj is pd.NaT:
                        return pd.NaT
                    # Ensure timezone is UTC
                    if dt_obj.tzinfo is None:
                        return dt_obj.tz_localize('UTC')
                    else:
                        return dt_obj.tz_convert('UTC')

                elif dataset_id == "2nrs-mtv8": # LAPD (separate date and HHMM time)
                    date_part = date_str_full.split('T')[0]
                    time_str_val = row.get('time_str')
                    parsed_time = "12:00:00" # Default
                    if time_str_val is not None and pd.notna(time_str_val):
                        time_str = str(time_str_val).zfill(4)
                        if len(time_str) == 4 and time_str.isdigit():
                            hour = int(time_str[:2])
                            minute = int(time_str[2:])
                            if hour >= 24: hour, minute = 23, 59 # Handle '2400'
                            parsed_time = f"{hour:02d}:{minute:02d}:00"
                        # else: logger.debug(f"Invalid time format '{time_str_val}', using default.") # Optional debug
                    # else: logger.debug("Missing time_str, using default.") # Optional debug

                    dt_str = f"{date_part} {parsed_time}"
                    dt_obj = pd.to_datetime(dt_str, errors='coerce')
                    return dt_obj.tz_localize('UTC') if dt_obj is not pd.NaT else pd.NaT

                else: # Generic fallback (attempt basic parsing)
                     dt_obj = pd.to_datetime(date_str_full, errors='coerce')
                     if dt_obj is pd.NaT:
                         return pd.NaT
                     if dt_obj.tzinfo is None: return dt_obj.tz_localize('UTC')
                     else: return dt_obj.tz_convert('UTC')

            except Exception as e:
                # logger.warning(f"Datetime parsing error for row: {row.to_dict()}, Error: {e}") # Detailed log if needed
                return pd.NaT

        df['datetime_occ'] = df.apply(parse_datetime_internal, axis=1)
        rows_before_dt_drop = len(df)
        df.dropna(subset=['datetime_occ'], inplace=True)
        rows_after_dt_drop = len(df)
        if rows_before_dt_drop > rows_after_dt_drop:
             logger.info(f"Dropped {rows_before_dt_drop - rows_after_dt_drop} rows due to datetime parsing errors.")

        if df.empty:
            logger.warning(f"No valid records remaining after datetime parsing for {city_name}.")
            return pd.DataFrame()

        df['hour'] = df['datetime_occ'].dt.hour
        logger.info("Successfully parsed datetime and extracted hour.")

        # Select columns needed for next steps
        df_for_mapping = df[['latitude', 'longitude', 'crime_code', 'hour']].copy()
        del df # Free memory

        # 5. Match Coordinates to Census Blocks (Batch RPC)
        logger.info(f"Starting geospatial mapping for {len(df_for_mapping)} records using RPC 'match_points_to_block_groups'...")
        coordinates = df_for_mapping[['latitude', 'longitude']].to_dict('records')
        # Format for RPC: list of {'lat': ..., 'lon': ...}
        coordinates_rpc = [{'lat': c['latitude'], 'lon': c['longitude']} for c in coordinates]

        all_block_data = [] # To store results from all batches
        total_coords = len(coordinates_rpc)
        total_batches = math.ceil(total_coords / GEO_MAPPING_BATCH_SIZE)
        processed_batches = 0
        failed_batches = 0

        logger.info(f"Processing {total_coords:,} coordinates in {total_batches} batches (size {GEO_MAPPING_BATCH_SIZE}).")

        if not supabase:
             logger.error("Supabase client is not available for RPC call.")
             return None

        for i in range(0, total_coords, GEO_MAPPING_BATCH_SIZE):
            coord_chunk = coordinates_rpc[i:i + GEO_MAPPING_BATCH_SIZE]
            batch_num = (i // GEO_MAPPING_BATCH_SIZE) + 1
            logger.info(f"Mapping coordinates: Batch {batch_num}/{total_batches} ({len(coord_chunk)} coords)")

            try:
                rpc_response = supabase.rpc('match_points_to_block_groups', {'points_json': coord_chunk}).execute()

                if rpc_response.data and isinstance(rpc_response.data, list):
                    # Basic check for response length mismatch
                    if len(rpc_response.data) != len(coord_chunk):
                        logger.warning(f"RPC mapping response length mismatch for batch {batch_num}! Expected {len(coord_chunk)}, Got {len(rpc_response.data)}. Results may be misaligned.")
                        # Pad with Nones to maintain length if response is shorter? Or handle alignment later.
                        # For now, extend with what we got, but this is risky.
                    all_block_data.extend(rpc_response.data)
                    processed_batches += 1
                    # logger.debug(f"Mapping batch {batch_num} successful.") # Optional debug
                elif hasattr(rpc_response, 'error') and rpc_response.error:
                    logger.error(f"Supabase RPC error (match_points_to_block_groups) for batch {batch_num}: {rpc_response.error}")
                    all_block_data.extend([None] * len(coord_chunk)) # Add placeholders
                    failed_batches += 1
                else:
                    logger.warning(f"RPC mapping call for batch {batch_num} returned no data or unexpected format: {rpc_response.data}")
                    all_block_data.extend([None] * len(coord_chunk))
                    failed_batches += 1

            except APIError as api_err:
                logger.error(f"APIError during RPC mapping call for batch {batch_num}: {api_err}", exc_info=False)
                all_block_data.extend([None] * len(coord_chunk))
                failed_batches += 1
            except Exception as rpc_err:
                logger.error(f"Unexpected error processing RPC mapping for batch {batch_num}: {rpc_err}", exc_info=True)
                all_block_data.extend([None] * len(coord_chunk))
                failed_batches += 1
            
            time.sleep(0.1) # Small delay between batches

        logger.info(f"Finished RPC mapping calls. Processed Batches: {processed_batches}, Failed Batches: {failed_batches}.")

        # Verify final length before proceeding
        if len(all_block_data) != total_coords:
            logger.error(f"CRITICAL ERROR: Final block data length ({len(all_block_data)}) does not match input coordinate length ({total_coords}) after RPC calls. Aborting processing.")
            return None

        # --- Process and Merge RPC Results ---
        logger.info("Processing and merging census block data from RPC results...")
        # Convert None values from RPC result (no match) into empty dicts for DataFrame creation
        processed_block_data = [item if item is not None else {} for item in all_block_data]
        block_df = pd.DataFrame(processed_block_data) # Create DF from list of dicts (incl. empty ones)

        # Rename columns coming from RPC if necessary (based on RPC function output)
        # RPC returns: id, block_group_id, total_population, housing_units
        block_df.rename(columns={
            'id': 'census_block_pk', # This is the actual primary key of census_blocks
            'block_group_id': 'block_group_identifier', # Keep original identifier distinct
            'total_population': 'population',
            'housing_units': 'housing_units'
        }, inplace=True)

        # Check for expected columns after rename
        expected_block_cols = ['census_block_pk', 'block_group_identifier', 'population', 'housing_units']
        missing_block_cols = [col for col in expected_block_cols if col not in block_df.columns]
        if missing_block_cols:
             logger.error(f"Missing expected columns from block mapping RPC result after rename: {missing_block_cols}")
             # Decide how critical this is - maybe proceed without them?
             # For now, let's log and continue, they might be handled later.

        # Merge block data back based on index (assumes order was preserved)
        processed_df = pd.concat([df_for_mapping.reset_index(drop=True), block_df.reset_index(drop=True)], axis=1)
        logger.info(f"Merged block data. DataFrame shape: {processed_df.shape}, Columns: {processed_df.columns.tolist()}")

        # 6. Post-Merge Cleaning and Final Calculations
        initial_rows = len(processed_df)
        # Drop rows where block mapping failed (PK is null)
        processed_df.dropna(subset=['census_block_pk'], inplace=True)
        rows_after_map_drop = len(processed_df)
        if initial_rows > rows_after_map_drop:
            logger.info(f"Dropped {initial_rows - rows_after_map_drop} records that failed census block mapping.")

        if processed_df.empty:
            logger.warning(f"No records remaining after merging block data for {city_name}.")
            return pd.DataFrame()

        # Convert population/housing to numeric, fill NaNs
        processed_df['population'] = pd.to_numeric(processed_df.get('population'), errors='coerce').fillna(0).astype(int)
        processed_df['housing_units'] = pd.to_numeric(processed_df.get('housing_units'), errors='coerce').fillna(0).astype(int)

        # Calculate population density proxy
        processed_df['population_density_proxy'] = processed_df.apply(
            lambda row: row['population'] / row['housing_units'] if row['housing_units'] > 0 else 0.0,
            axis=1
        ).astype(float)
        logger.info("Calculated population density proxy.")

        # 7. Final Column Selection
        final_cols = [
            'crime_code', 'latitude', 'longitude', 'hour', # Original data
            'census_block_pk', 'block_group_identifier', # Block info
            'population', 'housing_units', 'population_density_proxy' # Calculated fields
        ]
        # Ensure all expected columns exist before selecting
        final_df = processed_df[[col for col in final_cols if col in processed_df.columns]].copy()

        logger.info(f"Processing complete for {city_name}. Final DataFrame shape: {final_df.shape}")
        logger.debug(f"Final columns: {final_df.columns.tolist()}")
        # logger.debug(f"Final DataFrame head:\n{final_df.head()}") # Optional debug
        return final_df

    except Exception as e:
        logger.error(f"An unexpected error occurred during process_crime_data for {city_name}: {e}", exc_info=True)
        return None

# --- Metric Calculation Helper Functions ---

def calculate_weighted_incidents(direct_incidents: int, neighbor_incident_map: dict) -> float:
    """
    Calculates a weighted incident count using direct incidents and a fraction
    of the total incidents in neighboring blocks.
    Uses the global NEIGHBOR_INCIDENT_WEIGHT constant.
    """
    neighbor_incidents_total = sum(neighbor_incident_map.values())
    # pop_density_proxy is available in the main loop but not directly used in this formula
    weighted_score = float(direct_incidents) + NEIGHBOR_INCIDENT_WEIGHT * neighbor_incidents_total
    return weighted_score

def calculate_safety_score(weighted_incidents: float) -> float:
    """
    Calculates a safety score (0-10, higher is safer) based on weighted incidents
    using exponential decay. Maps 0 incidents to score 10.
    Uses the global SCORE_DECAY_CONSTANT_K constant.
    """
    # Ensure weighted_incidents is non-negative
    safe_weighted_incidents = max(0.0, weighted_incidents)
    # score = 10 * exp(-k * weighted_incidents)
    score = 10.0 * math.exp(-SCORE_DECAY_CONSTANT_K * safe_weighted_incidents)
    # Ensure score is strictly non-negative (though math.exp should handle this)
    final_score = max(0.0, score)
    return final_score

def get_risk_description(
    metric_type: str,
    score: float,
    direct_incidents: int, # Kept for potential future use, but not primary in description
    weighted_incidents: float, # Kept for potential future use
    incidents_per_1000: float, # Kept for potential future use
    contributing_neighbor_count: int # Kept for potential future use
) -> str:
    """
    Generates a user-friendly, implication-focused description based on the
    metric type and calculated safety score (0-10 scale).
    """
    try:
        # Determine risk level category based on score (0-10)
        if score >= 8: risk_level = "Very Low"
        elif score >= 6: risk_level = "Low"
        elif score >= 4: risk_level = "Moderate"
        elif score >= 2: risk_level = "High"
        else: risk_level = "Very High"

        # Get base question/context from loaded global config
        metric_config = METRIC_DEFINITIONS.get(metric_type, {})
        base_question = metric_config.get('question', f'Regarding {metric_type.replace("_", " ")}')
        base_description = metric_config.get('description', f'overall safety risk for {metric_type.replace("_", " ")}')

        # --- User-Friendly Descriptions based on Risk Level and Metric Type ---
        # Structure: { metric_type: { risk_level: description_string } }
        descriptions = {
            "night": { 
                "Very Low": "This area is very safe for walking at night, with minimal risk. While a few incidents have been reported nearby, they are rare, and the overall environment remains low-risk.",
                "Low": "The area is generally safe at night, though occasional incidents have been reported. Staying aware of your surroundings is usually enough.",
                "Moderate": "Exercise caution after dark. Stick to well-lit areas and avoid walking alone, as there is some risk of nighttime incidents.",
                "High": "Be cautious at night, as incidents are more frequent. It’s safer to use taxis or ride-shares instead of walking alone.",
                "Very High": "High nighttime incident rates have been reported nearby. Avoid walking alone after dark and use secure transportation whenever possible."
            },
            "daytime": { 
                "Very Low": "This area is very safe during the day, allowing you to move around with peace of mind.",
                "Low": "Daytime incidents are uncommon, and standard precautions are typically enough to stay safe.",
                "Moderate": "Be mindful of your surroundings during the day, especially in busy areas, as some incidents have been reported.",
                "High": "Stay alert during daylight hours, as there is a noticeable level of reported incidents in this area.",
                "Very High": "Daytime safety requires extra caution. Be aware of potential risks, as incidents occur relatively frequently."
            },
            "vehicle": { 
                "Very Low": "Vehicle break-ins and theft are rare in this area. Parking is generally safe.",
                "Low": "Car-related crime is infrequent, but it’s still wise to lock doors and keep valuables out of sight.",
                "Moderate": "Some risk of vehicle break-ins exists. Avoid leaving valuables visible and consider parking in well-lit areas.",
                "High": "There’s a notable risk of car theft or break-ins. Secure parking is recommended if available.",
                "Very High": "High rates of vehicle crime have been reported nearby. Prioritize secure, monitored parking and remove all valuables."
            },
            "transit": { 
                "Very Low": "Public transport near this location is very safe, both day and night.",
                "Low": "Using public transport here is generally safe, with only occasional incidents affecting commuters.",
                "Moderate": "Stay aware of your surroundings when using public transport, especially during off-peak hours, as some safety concerns have been reported.",
                "High": "Use caution when traveling on public transport in this area. Remain alert to potential risks.",
                "Very High": "Reports indicate notable safety concerns on public transport near this area. Be vigilant, especially at night."
            },
            "women": { 
                "Very Low": "This area is very safe and comfortable for solo women travelers, both day and night.",
                "Low": "Generally safe for solo women. Staying aware of your surroundings is usually enough.",
                "Moderate": "Solo women should take extra caution, especially after dark, as some safety concerns have been reported.",
                "High": "Women traveling alone should take extra precautions. There are safety concerns, particularly at night.",
                "Very High": "Significant safety concerns have been reported for solo women in this area. Avoid traveling alone if possible, especially at night."
            },
            "property": { 
                "Very Low": "Property crime (theft, burglary, vandalism) is very rare in this area.",
                "Low": "Property crime is infrequent. Standard security measures, such as locking doors, are generally effective.",
                "Moderate": "Some risk of property crime exists. Lock doors and windows, and avoid leaving valuables in plain sight.",
                "High": "Property crime is a concern in this area. Consider additional security measures to protect your belongings.",
                "Very High": "High rates of property crime have been reported. Stay vigilant and use strong security measures where possible."
            }
            # Add more specific descriptions for other metric types as needed
        }

        # Fallback description using the base description from config
        default_descriptions = {
            "Very Low": f"Very low risk regarding {base_description}.",
            "Low": f"Low risk regarding {base_description}.",
            "Moderate": f"Moderate risk regarding {base_description}. Exercise reasonable caution.",
            "High": f"High risk regarding {base_description}. Increased awareness is advised.",
            "Very High": f"Very high risk regarding {base_description}. Take significant precautions."
        }

        # Get the specific description or fallback
        description = descriptions.get(metric_type, default_descriptions).get(risk_level, default_descriptions[risk_level])

        # Prepend the base question for context
        full_description = f"{base_question}: {description}"

        return full_description.strip()

    except Exception as e:
        logger.error(f"Error generating user-friendly risk description for {metric_type}: {e}", exc_info=False)
        # Fallback to a generic error message including the metric type
        metric_name = metric_type.replace('_', ' ')
        return f"Could not determine specific risk details for {metric_name}. Score indicates {risk_level.lower()} risk overall."


def calculate_metrics(processed_df: pd.DataFrame, target_city_id: int, city_config: dict) -> dict:
    """
    Calculates all safety metrics for each relevant census block.
    Steps:
    1. Pre-fetches neighbor relationships for all unique blocks via batch RPC.
    2. Iterates through each metric type defined in global config.
    3. Filters data based on metric-specific crime codes and time filters.
    4. Aggregates incidents per block.
    5. Calculates weighted incidents and scores for each block.
    6. Formats results into a dictionary {metric_type: [list_of_records]}.
    """
    if processed_df is None or processed_df.empty:
        logger.warning("No processed data provided to calculate_metrics. Returning empty results.")
        return {}
    
    city_name = city_config.get('city_name', f'ID {target_city_id}')
    logger.info(f"Calculating safety metrics for {city_name} using {len(processed_df):,} processed records.")

    results = {} # Dictionary to hold lists of metric records by type
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=METRIC_EXPIRY_DAYS)

    # Ensure Supabase client is available
    if not supabase:
        logger.error("Supabase client not available for neighbor calculation.")
        return {}

    # --- 1. Pre-calculate Neighbors (Batch RPC) ---
    neighbor_radius = city_config.get('geospatial', {}).get('neighbor_radius_meters', DEFAULT_NEIGHBOR_RADIUS_METERS)
    neighbor_batch_size = city_config.get('geospatial', {}).get('neighbor_batch_size', DEFAULT_NEIGHBOR_BATCH_SIZE)
    logger.info(f"Pre-calculating neighbors within {neighbor_radius}m using batch RPC 'find_block_neighbors_batch' (batch size: {neighbor_batch_size})...")
    
    neighbor_cache = {} # Stores {block_pk: [neighbor_pk1, neighbor_pk2, ...]}
    unique_block_pks = processed_df['census_block_pk'].unique().tolist()
    total_unique_blocks = len(unique_block_pks)
    logger.info(f"Found {total_unique_blocks} unique block PKs with incidents to fetch neighbors for.")

    processed_neighbor_batches = 0
    failed_neighbor_batches = 0
    if total_unique_blocks > 0:
        total_neighbor_batches = math.ceil(total_unique_blocks / neighbor_batch_size)
        logger.info(f"Fetching neighbors in {total_neighbor_batches} batches.")

        for i in range(0, total_unique_blocks, neighbor_batch_size):
            pk_chunk = unique_block_pks[i:i + neighbor_batch_size]
            batch_num = (i // neighbor_batch_size) + 1
            logger.info(f"Fetching neighbors: Batch {batch_num}/{total_neighbor_batches} ({len(pk_chunk)} blocks)")
            
            # # --- DEBUG: Log IDs for the specific batch that failed previously ---
            # if batch_num == 6:
            #     logger.warning(f"DEBUG: Processing Batch 6 - Block IDs: {pk_chunk}")
            # # --- END DEBUG ---

            try:
                # Call the batch RPC function (expects list of strings)
                # RPC function already sets a timeout internally
                batch_neighbor_response = supabase.rpc(
                    'find_block_neighbors_batch',
                    {'target_block_ids': [str(pk) for pk in pk_chunk]}
                ).execute()

                # Response data is expected to be a JSON object: {target_id: [neighbor_ids], ...}
                if batch_neighbor_response.data and isinstance(batch_neighbor_response.data, dict):
                    neighbor_cache.update(batch_neighbor_response.data) # Merge results
                    processed_neighbor_batches += 1
                    # logger.debug(f"Neighbor batch {batch_num} successful.") # Optional debug
                elif hasattr(batch_neighbor_response, 'error') and batch_neighbor_response.error:
                    logger.error(f"Error calling neighbor RPC for batch {batch_num}: {batch_neighbor_response.error}")
                    failed_neighbor_batches += 1
                else:
                    # This case might occur if the RPC returns an empty dict or non-dict data
                    logger.warning(f"Neighbor RPC for batch {batch_num} returned no data or unexpected format: {batch_neighbor_response.data}")
                    # We don't explicitly mark as failed here, but no data was added.

            except APIError as api_err:
                 logger.error(f"APIError calling neighbor RPC for batch {batch_num}: {api_err}", exc_info=False)
                 failed_neighbor_batches += 1
            except Exception as rpc_err:
                logger.error(f"Exception calling neighbor RPC for batch {batch_num}: {rpc_err}", exc_info=True)
                failed_neighbor_batches += 1
            
            time.sleep(0.1) # Small delay between batches
            
        logger.info(f"Neighbor pre-calculation finished. Successful Batches: {processed_neighbor_batches}, Failed Batches: {failed_neighbor_batches}. Cache size: {len(neighbor_cache)} blocks.")
        if failed_neighbor_batches > 0:
            logger.warning(f"Neighbor data may be incomplete due to {failed_neighbor_batches} failed RPC batches.")
    else:
        logger.info("No unique blocks found to fetch neighbors for.")
    # --- End Neighbor Pre-calculation --- 

    # --- 2. Calculate Metrics per Type ---
    city_id_str = str(target_city_id) # For mapping lookup
    if city_id_str not in CITY_SPECIFIC_MAPPINGS:
        logger.error(f"Crime code mappings not found for city_id '{target_city_id}' in global config. Cannot calculate metrics.")
        return {}
    city_crime_codes = CITY_SPECIFIC_MAPPINGS[city_id_str]

    for metric_type, metric_info in METRIC_DEFINITIONS.items(): 
        logger.info(f"--- Processing Metric: '{metric_type}' for {city_name} ---")

        # --- 2a. Filter by Crime Code ---
        if metric_type not in city_crime_codes:
            logger.warning(f"Metric type '{metric_type}' not found in crime code mapping for city {city_id_str}. Skipping.")
            results[metric_type] = []
            continue
        relevant_codes = city_crime_codes[metric_type]
        if not relevant_codes:
             logger.info(f"No crime codes defined for metric '{metric_type}' in city {city_id_str}. Skipping.")
             results[metric_type] = []
             continue
        
        # Filter the main DataFrame for relevant codes for this metric
        metric_crimes_df = processed_df[processed_df['crime_code'].isin(relevant_codes)].copy()
        logger.info(f"Found {len(metric_crimes_df):,} initial incidents for codes: {relevant_codes}")

        # --- 2b. Apply Time Filter (if defined) ---
        time_filter_hours = metric_info.get('time_filter')
        dataset_id_for_time_check = city_config.get('crime_data', {}).get('dataset_id')
        # Specific check to skip time filtering for datasets known to have bad time data (e.g., NYPD)
        skip_time_filter = dataset_id_for_time_check == "uip8-fykc"

        if time_filter_hours and isinstance(time_filter_hours, list):
            if skip_time_filter:
                 logger.warning(f"Skipping time filter {time_filter_hours} for metric '{metric_type}' in {city_name} (Dataset: {dataset_id_for_time_check}) due to known timestamp issues.")
            else:
                if 'hour' in metric_crimes_df.columns and pd.api.types.is_numeric_dtype(metric_crimes_df['hour']):
                    initial_count = len(metric_crimes_df)
                    metric_crimes_df = metric_crimes_df[metric_crimes_df['hour'].isin(time_filter_hours)]
                    filtered_count = len(metric_crimes_df)
                    logger.info(f"Applied time filter (Hours: {time_filter_hours}). Records reduced from {initial_count} to {filtered_count}.")
                else:
                    logger.warning(f"Could not apply time filter for '{metric_type}': 'hour' column missing or not numeric.")
        elif time_filter_hours:
             logger.warning(f"Time filter for metric '{metric_type}' is defined but not a list: {time_filter_hours}. Skipping filter.")

        if metric_crimes_df.empty:
            logger.info(f"No relevant incidents found for metric '{metric_type}' after code/time filtering.")
            results[metric_type] = []
            continue

        logger.info(f"Processing {len(metric_crimes_df):,} incidents for metric '{metric_type}'.")

        # --- 2c. Aggregate Incidents per Block ---
        # Group by the block primary key ('census_block_pk')
        # Keep other needed fields for score calculation and output record
        block_group_stats = metric_crimes_df.groupby('census_block_pk').agg(
            block_group_identifier=('block_group_identifier', 'first'), # Keep original ID if needed
            direct_incidents=('crime_code', 'size'),
            latitude=('latitude', 'mean'), # Use mean lat/lon of incidents in block
            longitude=('longitude', 'mean'),
            population=('population', 'first'), # Population of the block
            # housing_units=('housing_units', 'first'), # Not directly needed for score calc
            population_density_proxy=('population_density_proxy', 'first')
        ).reset_index() # census_block_pk becomes a column

        logger.info(f"Aggregated incidents into {len(block_group_stats)} census blocks for '{metric_type}'.")

        # Create a map of {block_pk: incident_count} for efficient neighbor lookup
        metric_incident_map_pk = block_group_stats.set_index('census_block_pk')['direct_incidents'].to_dict()

        # --- 2d. Calculate Score for Each Block ---
        metric_records = [] # List to store final records for this metric type
        for _, block_row in tqdm(block_group_stats.iterrows(), total=len(block_group_stats), desc=f"Calculating {metric_type} scores", unit="block"):
            current_block_pk = block_row['census_block_pk']
            direct_incidents = block_row['direct_incidents']
            population = block_row['population']
            pop_density_proxy = block_row['population_density_proxy']
            latitude = block_row['latitude']
            longitude = block_row['longitude']

            # Get neighbors from cache (defaults to empty list if block not in cache or failed)
            neighbor_pks = neighbor_cache.get(current_block_pk, [])
            
            # Calculate total incidents from neighbors that exist in *this metric's* incident map
            neighbor_incident_map = {
                nid_pk: metric_incident_map_pk.get(nid_pk, 0)
                for nid_pk in neighbor_pks if nid_pk in metric_incident_map_pk
            }
            contributing_neighbor_count = len(neighbor_incident_map) # Count neighbors that *had* incidents for this metric

            # Calculate weighted incidents and score
            weighted_incidents = calculate_weighted_incidents(direct_incidents, neighbor_incident_map)
            score = calculate_safety_score(weighted_incidents)
            incidents_per_1000 = (direct_incidents / population) * 1000.0 if population > 0 else 0.0

            # Generate description
            description = get_risk_description(
                metric_type,
                score,
                direct_incidents,
                weighted_incidents,
                incidents_per_1000,
                contributing_neighbor_count
            )

            # Create stable UUID based on city, block PK, and metric type
            id_string = f"{target_city_id}:{current_block_pk}:{metric_type}"
            stable_metric_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, id_string))

            # Prepare record for insertion
            # Ensure types match Supabase table schema
            metric_record = {
                'id': stable_metric_id,
                'city_id': int(target_city_id),
                'block_group_id': str(current_block_pk), # FK column uses the PK
                'latitude': float(latitude),
                'longitude': float(longitude),
                'geom': f"SRID=4326;POINT({longitude} {latitude})", # Optional: Construct geom string
                'metric_type': str(metric_type),
                'score': float(score), # NUMERIC in DB
                'question': str(metric_info.get('question', '')),
                'description': str(description),
                'direct_incidents': int(direct_incidents),
                'weighted_incidents': float(weighted_incidents), # NUMERIC in DB
                'population_density': float(pop_density_proxy), # NUMERIC in DB
                'incidents_per_1000': float(incidents_per_1000), # NUMERIC in DB
                'created_at': now.isoformat(),
                'expires_at': expires_at.isoformat()
                # Optional: Add block_group_identifier if needed: block_row['block_group_identifier']
            }
            metric_records.append(metric_record)

        results[metric_type] = metric_records
        logger.info(f"Generated {len(metric_records)} metric records for type '{metric_type}'.")

    logger.info("Finished calculating all metric types.")
    return results

def upload_metrics(metrics_by_type: dict, target_city_id: int, test_mode: bool):
    """
    Uploads the calculated safety metrics to the Supabase 'safety_metrics' table.
    In production mode, it first deletes existing metrics for the city.
    In test mode, it skips all database operations.
    """
    # Ensure Supabase client is available
    if not supabase:
        logger.error("Supabase client not available for uploading metrics.")
        return
        
    # Aggregate all metric records from the input dictionary
    all_metrics = []
    for metric_type, metrics_list in metrics_by_type.items():
        if metrics_list:
            all_metrics.extend(metrics_list)

    total_metrics = len(all_metrics)
    logger.info(f"Preparing to upload {total_metrics:,} total calculated metrics for city ID {target_city_id}.")

    if total_metrics == 0:
        logger.info("No metrics generated, nothing to upload.")
        # Optional: Decide if we should still delete old metrics even if no new ones were generated.
        # For now, we only delete if there are new metrics to insert.
        return

    # --- Test Mode Check ---
    if test_mode:
        logger.info(f"[TEST MODE] Would upload {total_metrics:,} metrics. Skipping database operations.")
        # Optionally, log a sample of metrics that would be uploaded:
        # if all_metrics:
        #    logger.debug(f"[TEST MODE] Sample metric record to be uploaded:\n{json.dumps(all_metrics[0], indent=2)}")
        return

    # --- Production Mode: Delete and Upload ---
    city_name = "Unknown City" # Default
    try:
         # Fetch city name for logging clarity
         city_info = supabase.table('cities').select('name').eq('id', target_city_id).maybe_single().execute()
         if city_info.data:
              city_name = city_info.data.get('name', f'ID {target_city_id}')
    except Exception as city_fetch_err:
         logger.warning(f"Could not fetch city name for ID {target_city_id}: {city_fetch_err}")
         city_name = f'ID {target_city_id}'

    # 1. Delete existing metrics for the target city
    try:
        logger.info(f"Deleting existing safety metrics for {city_name} (ID: {target_city_id})...")
        delete_response = supabase.table('safety_metrics').delete().eq('city_id', target_city_id).execute()
        
        # Supabase delete response doesn't reliably give counts, check for errors
        if hasattr(delete_response, 'error') and delete_response.error:
             logger.error(f"Error deleting existing metrics for {city_name}: {delete_response.error}")
             logger.warning("Aborting upload due to delete failure.")
             return # Stop if delete fails
        else:
             # Log success, actual count deleted isn't easily available without another query
             logger.info(f"Successfully sent delete request for existing metrics for {city_name}.")

    except APIError as api_err:
        logger.error(f"APIError during delete operation for {city_name}: {api_err}", exc_info=False)
        logger.warning("Aborting upload due to delete failure.")
        return
    except Exception as del_err:
        logger.error(f"Unexpected error during delete operation for {city_name}: {del_err}", exc_info=True)
        logger.warning("Aborting upload due to delete failure.")
        return

    # 2. Insert new metrics in batches
    total_inserted = 0
    total_failed_records = 0
    total_batches = math.ceil(total_metrics / METRIC_UPLOAD_BATCH_SIZE)
    logger.info(f"Starting batch inserts for {total_metrics} new metrics in {total_batches} batches (size {METRIC_UPLOAD_BATCH_SIZE})...")

    for i in range(0, total_metrics, METRIC_UPLOAD_BATCH_SIZE):
        batch = all_metrics[i:i + METRIC_UPLOAD_BATCH_SIZE]
        batch_number = (i // METRIC_UPLOAD_BATCH_SIZE) + 1
        logger.info(f"Inserting metrics batch {batch_number}/{total_batches} ({len(batch)} records) for {city_name}.")
        
        try:
            insert_response = supabase.table('safety_metrics').insert(batch, count='exact').execute() # Use count='exact'
            
            # Check for API level errors first
            if hasattr(insert_response, 'error') and insert_response.error:
                logger.error(f"APIError on insert batch {batch_number} for {city_name}: {insert_response.error}")
                total_failed_records += len(batch) # Assume whole batch failed on API error
            # Check the count returned by the API
            elif hasattr(insert_response, 'count') and insert_response.count is not None:
                 inserted_in_batch = insert_response.count
                 total_inserted += inserted_in_batch
                 failed_in_batch = len(batch) - inserted_in_batch
                 if failed_in_batch > 0:
                      total_failed_records += failed_in_batch
                      logger.warning(f"Batch {batch_number} partially failed for {city_name}. Succeeded: {inserted_in_batch}, Failed: {failed_in_batch}. Check DB logs for constraint violations.")
                 # else: logger.debug(f"Batch {batch_number} inserted successfully ({inserted_in_batch} records).") # Optional debug
            else:
                 # If no error and no count, it's an unexpected response
                 logger.warning(f"Batch {batch_number} for {city_name} returned no error and no count. Assuming failure for {len(batch)} records.")
                 total_failed_records += len(batch)

        except APIError as api_err:
             logger.error(f"APIError during insert batch {batch_number} for {city_name}: {api_err}", exc_info=False)
             total_failed_records += len(batch) # Assume whole batch failed
        except Exception as e:
            logger.error(f"Unexpected error during insert batch {batch_number} for {city_name}: {e}", exc_info=True)
            total_failed_records += len(batch)
        
        time.sleep(0.1) # Small delay between batches

    logger.info(f"Finished metrics upload for {city_name}. Total Inserted: {total_inserted:,}, Total Failed: {total_failed_records:,}")
    if total_failed_records > 0:
         logger.warning("Some metric records failed to insert. Review logs and potential DB constraint issues.")

def update_accommodation_safety_scores(supabase_client: Client, target_city_id: int):
    """
    Calculates and updates the overall_safety_score, census_block_id, and
    safety_metric_types_found for accommodations in the target city based on
    nearby safety_metrics.
    """
    logger.info(f"Starting accommodation overall safety score update process for city ID: {target_city_id}...")

    if not supabase_client:
        logger.error("Supabase client is not available for updating accommodation scores.")
        return

    # Fetch city name for logging
    city_name = f"ID {target_city_id}"
    try:
        city_info = supabase_client.table('cities').select('name').eq('id', target_city_id).maybe_single().execute()
        if city_info.data:
            city_name = city_info.data.get('name', city_name)
    except Exception as city_fetch_err:
        logger.warning(f"Could not fetch city name for ID {target_city_id}: {city_fetch_err}")

    logger.info(f"Target City: {city_name}")
    logger.info(f"Required metric types for score: {len(METRIC_DEFINITIONS)} ({', '.join(sorted(METRIC_DEFINITIONS.keys()))})")
    logger.info(f"Maximum distance for linking metrics: {MAX_ACCOMMODATION_METRIC_DISTANCE_KM} km")

    try:
        # 1. Fetch all current safety metrics for the target city using PAGINATION
        logger.info(f"Fetching all safety metrics for {city_name} with pagination...")
        all_metrics_data = []
        batch_size = 1000 # Fetch in batches of 1000 (known working limit)
        offset = 0
        while True:
            logger.debug(f"Fetching metrics batch: offset={offset}, limit={batch_size}")
            try:
                metrics_response = supabase_client.table('safety_metrics') \
                                                  .select('id, latitude, longitude, metric_type, score, block_group_id, city_id') \
                                                  .eq('city_id', target_city_id) \
                                                  .not_.is_('latitude', 'null') \
                                                  .not_.is_('longitude', 'null') \
                                                  .not_.is_('block_group_id', 'null') \
                                                  .not_.is_('score', 'null') \
                                                  .limit(batch_size) \
                                                  .offset(offset) \
                                                  .execute()
                
                if metrics_response.data:
                    all_metrics_data.extend(metrics_response.data)
                    logger.debug(f"  Fetched {len(metrics_response.data)} records in this batch.")
                    # If fewer records than batch size were returned, we got the last page
                    if len(metrics_response.data) < batch_size:
                        break 
                    offset += batch_size # Prepare for next batch
                else:
                    # No more data or an error occurred (check error attribute)
                    if hasattr(metrics_response, 'error') and metrics_response.error:
                         logger.error(f"Error fetching metrics batch (offset {offset}): {metrics_response.error}")
                         # Decide whether to proceed with partial data or abort
                         # For now, let's break and use what we have, but log a warning
                         logger.warning("Aborting metric fetch pagination due to API error.")
                         break
                    else:
                        break # No data and no error means we are done

            except APIError as api_err:
                logger.error(f"APIError fetching metrics batch (offset {offset}): {api_err}", exc_info=False)
                logger.warning("Aborting metric fetch pagination due to APIError.")
                break # Stop fetching on error
            except Exception as fetch_err:
                logger.error(f"Unexpected error fetching metrics batch (offset {offset}): {fetch_err}", exc_info=True)
                logger.warning("Aborting metric fetch pagination due to unexpected error.")
                break # Stop fetching on error

        logger.info(f"Total metrics fetched via pagination: {len(all_metrics_data)}")

        if not all_metrics_data:
            logger.warning(f"No valid safety metrics found for {city_name} after pagination fetch.")
            return
        
        # Proceed with creating the DataFrame from the combined list
        metrics_df = pd.DataFrame(all_metrics_data)
        # logger.info(f"Initial metrics count from DB query: {len(metrics_df)}") # No longer needed right after creation
        
        # Convert types, handle potential errors
        metrics_df['latitude'] = pd.to_numeric(metrics_df['latitude'], errors='coerce')
        metrics_df['longitude'] = pd.to_numeric(metrics_df['longitude'], errors='coerce')
        metrics_df['score'] = pd.to_numeric(metrics_df['score'], errors='coerce')
        # Rename 'block_group_id' (which is the census_block PK) to avoid confusion
        metrics_df.rename(columns={'block_group_id': 'census_block_pk'}, inplace=True)
        
        # Drop rows with nulls in critical columns after conversion
        metrics_df.dropna(subset=['latitude', 'longitude', 'score', 'census_block_pk', 'metric_type'], inplace=True)

        if metrics_df.empty:
            logger.warning(f"No valid safety metrics remaining after cleaning for {city_name}.")
            return

        logger.info(f"Loaded {len(metrics_df)} valid safety metrics for {city_name}.")

        # 2. Build KDTree from metric coordinates for efficient spatial search
        metric_coords = metrics_df[['latitude', 'longitude']].values
        try:
             metric_tree = KDTree(metric_coords)
             logger.info("KDTree built successfully for safety metrics.")
        except Exception as tree_err:
             logger.error(f"Failed to build KDTree for safety metrics: {tree_err}", exc_info=True)
             return # Cannot proceed without KDTree

        # 3. Fetch accommodations for the target city using PAGINATION
        logger.info(f"Fetching accommodations for {city_name} with pagination...")
        all_accommodations_data = []
        acc_batch_size = 1000 # Batch size for fetching accommodations
        acc_offset = 0
        while True:
            logger.debug(f"Fetching accommodations batch: offset={acc_offset}, limit={acc_batch_size}")
            try:
                 acc_response = supabase_client.table('accommodations') \
                                               .select('id, latitude, longitude') \
                                               .eq('city_id', target_city_id) \
                                               .not_.is_('latitude', 'null') \
                                               .not_.is_('longitude', 'null') \
                                               .limit(acc_batch_size) \
                                               .offset(acc_offset) \
                                               .execute()

                 if acc_response.data:
                     all_accommodations_data.extend(acc_response.data)
                     logger.debug(f"  Fetched {len(acc_response.data)} accommodation records.")
                     if len(acc_response.data) < acc_batch_size:
                         break # Last page
                     acc_offset += acc_batch_size
                 else:
                     if hasattr(acc_response, 'error') and acc_response.error:
                          logger.error(f"Error fetching accommodations batch (offset {acc_offset}): {acc_response.error}")
                          logger.warning("Aborting accommodation fetch due to API error.")
                          break
                     else:
                          break # No more data
            
            except APIError as api_err:
                logger.error(f"APIError fetching accommodations batch (offset {acc_offset}): {api_err}", exc_info=False)
                logger.warning("Aborting accommodation fetch due to APIError.")
                break
            except Exception as fetch_err:
                logger.error(f"Unexpected error fetching accommodations batch (offset {acc_offset}): {fetch_err}", exc_info=True)
                logger.warning("Aborting accommodation fetch due to unexpected error.")
                break
                
        logger.info(f"Total accommodations fetched via pagination: {len(all_accommodations_data)}")

        if not all_accommodations_data:
            logger.info(f"No accommodations with valid coordinates found for {city_name} after pagination.")
            return

        accommodations = all_accommodations_data # Use the full list
        # logger.info(f"Fetched {len(accommodations)} accommodations for {city_name}.") # Logged above now

        # 4. Calculate Scores for Each Accommodation
        updates_to_make = [] # List to store update dictionaries
        processed_count = 0
        scores_calculated_count = 0
        missing_types_logged_count = 0
        MAX_MISSING_TYPE_LOGS = 20 # Limit verbose logging for missing types
        no_metrics_found_count = 0
        zero_score_detail_logged_count = 0
        MAX_ZERO_SCORE_DETAIL_LOGS = 10 # Limit verbose logging for zero scores

        required_metric_types_set = set(METRIC_DEFINITIONS.keys())

        logger.info("Calculating overall safety scores for accommodations...")
        for acc in tqdm(accommodations, desc=f"Calculating scores ({city_name})", unit="acc"):
            try:
                acc_id = acc['id']
                acc_lat = float(acc['latitude'])
                acc_lon = float(acc['longitude'])

                # --- 4a. Find Nearby Metrics using KDTree & Distance Filter ---
                k_neighbors = 50 # Start by checking nearest 50 metrics
                indices = []
                distances_kdtree = [] # Distances from KDTree (Euclidean approximation)
                
                # Ensure k is not larger than the number of points in the tree
                actual_k = min(k_neighbors, len(metric_coords))
                if actual_k > 0:
                    try:
                        distances_kdtree, indices = metric_tree.query([acc_lat, acc_lon], k=actual_k)
                        # Handle single result case
                        if actual_k == 1 and not isinstance(indices, (list, np.ndarray)):
                            distances_kdtree = [distances_kdtree]
                            indices = [indices]
                    except Exception as query_err:
                        logger.warning(f"KDTree query failed for Acc {acc_id} at ({acc_lat}, {acc_lon}): {query_err}")
                        indices = [] # Ensure indices is empty on failure
                else:
                     logger.warning(f"KDTree is empty, cannot query neighbors for Acc {acc_id}.")
                     indices = []

                # Filter valid indices and calculate actual Haversine distances
                valid_metrics_in_radius = []
                valid_indices = [idx for idx in indices if idx < len(metrics_df)] # Safety check

                for idx in valid_indices:
                    metric_row = metrics_df.iloc[idx]
                    dist_km = calculate_distance_km(acc_lat, acc_lon, metric_row['latitude'], metric_row['longitude'])
                    if dist_km <= MAX_ACCOMMODATION_METRIC_DISTANCE_KM:
                        valid_metrics_in_radius.append({
                            'index': idx, # Keep index if needed
                            'distance': dist_km,
                            'metric_type': metric_row['metric_type'],
                            'score': metric_row['score'],
                            'census_block_pk': metric_row['census_block_pk']
                        })
                
                # Sort by actual Haversine distance
                valid_metrics_in_radius.sort(key=lambda x: x['distance'])

                # --- 4b. Infer Block ID from Closest Overall Metric ---
                inferred_block_pk = None
                if valid_metrics_in_radius:
                    closest_metric_overall = valid_metrics_in_radius[0]
                    inferred_block_pk = closest_metric_overall['census_block_pk']
                    # logger.debug(f"Acc {acc_id}: Closest metric overall dist: {closest_metric_overall['distance']:.3f}km. Inferred block PK={inferred_block_pk}")
                else:
                     no_metrics_found_count += 1
                     # logger.warning(f"Acc {acc_id}: No metrics found within {MAX_ACCOMMODATION_METRIC_DISTANCE_KM}km.")
                     # Skip score calculation if no metrics are nearby
                     updates_to_make.append({
                        'id': acc_id,
                        'overall_safety_score': None,
                        'census_block_id': None,
                        'city_id': target_city_id,
                        'safety_metric_types_found': 0
                    })
                     processed_count += 1
                     continue # Move to the next accommodation

                # --- 4c. Select Closest Metric For Each Required Type ---
                # Group metrics by type first
                grouped_metrics = {}
                # --- DEBUG LOGGING FOR SPECIFIC ACCOMMODATION ---
                TARGET_ACC_ID_DEBUG = "17199843-2c68-4bff-959f-c87f1b7762d2"
                if acc_id == TARGET_ACC_ID_DEBUG:
                    logger.info(f"DEBUG {acc_id}: Found {len(valid_metrics_in_radius)} metrics within radius before grouping:")
                    for i, metric_debug in enumerate(valid_metrics_in_radius[:15]): # Log first 15
                         logger.info(f"  {i+1}. Type: {metric_debug['metric_type']}, Score: {metric_debug['score']:.4f}, Dist: {metric_debug['distance']:.4f}km, BlockPK: {metric_debug['census_block_pk']}")
                    if len(valid_metrics_in_radius) > 15:
                         logger.info("  ... (remaining metrics omitted)")
                # --- END DEBUG LOGGING ---
                for metric_data in valid_metrics_in_radius:
                    m_type = metric_data['metric_type']
                    if m_type not in grouped_metrics:
                        grouped_metrics[m_type] = []
                    # Store only necessary info (score, distance) for selection
                    grouped_metrics[m_type].append({
                        'score': metric_data['score'],
                        'distance': metric_data['distance']
                    })

                # Find the minimum distance metric within each group
                closest_metrics_by_type = {}
                for m_type, metrics_list in grouped_metrics.items():
                    if metrics_list:
                        closest_metric_for_type = min(metrics_list, key=lambda x: x['distance'])
                        # Only add if the type is actually required (safety check)
                        if m_type in required_metric_types_set:
                             closest_metrics_by_type[m_type] = closest_metric_for_type
                    # else: logger.warning(f"Acc {acc_id}: Empty metrics list found for type '{m_type}' after grouping.") # Should not happen
                
                # --- DEBUG LOGGING FOR SPECIFIC ACCOMMODATION ---
                if acc_id == TARGET_ACC_ID_DEBUG:
                     logger.info(f"DEBUG {acc_id}: Selected closest metrics by type:")
                     for m_type, m_data in closest_metrics_by_type.items():
                          score_val = m_data.get('score')
                          score_str = f"{score_val:.4f}" if score_val is not None else "None"
                          dist_str = f"{m_data.get('distance'):.4f}"
                          logger.info(f"  - {m_type}: Score={score_str}, Dist={dist_str}km")
                     if not closest_metrics_by_type:
                          logger.info("  (No required metrics types were selected)")
                # --- END DEBUG LOGGING ---

                # --- 4d. Calculate Overall Score ---
                found_metric_types = set(closest_metrics_by_type.keys())
                num_found_types = len(found_metric_types)
                overall_score = None
                average_score_debug = None # For logging

                if num_found_types > 0:
                    # Use scores from the selected closest metrics
                    valid_scores = [m['score'] for m in closest_metrics_by_type.values() if m.get('score') is not None]
                    
                    if valid_scores:
                        total_score = sum(valid_scores)
                        num_valid_scores = len(valid_scores)
                        average_score_debug = total_score / num_valid_scores
                        overall_score = int(round(average_score_debug * 10)) # Scale 0-10 score to 0-100
                        # --- DEBUG LOGGING FOR SPECIFIC ACCOMMODATION ---
                        if acc_id == TARGET_ACC_ID_DEBUG:
                            logger.info(f"DEBUG {acc_id}: Scores used for averaging: { [round(s, 4) for s in valid_scores] }")
                            logger.info(f"DEBUG {acc_id}: Calculated avg_score (0-10): {average_score_debug:.4f}, Final overall_score (0-100): {overall_score}")
                        # --- END DEBUG LOGGING ---
                        scores_calculated_count += 1

                        # Log details if score is zero (limited)
                        if overall_score == 0 and zero_score_detail_logged_count < MAX_ZERO_SCORE_DETAIL_LOGS:
                            logger.warning(f"Acc {acc_id} resulted in overall_score=0.")
                            logger.warning(f"  Avg Score (0-10): {average_score_debug:.4f} from {num_valid_scores} valid scores.")
                            logger.warning(f"  Individual Metric Scores (0-10) used:")
                            for m_type, m_data in closest_metrics_by_type.items():
                                score_val = m_data.get('score')
                                score_str = f"{score_val:.4f}" if score_val is not None else "None"
                                logger.warning(f"    - {m_type}: {score_str} (Dist: {m_data.get('distance'):.2f}km)")
                            zero_score_detail_logged_count += 1
                        elif overall_score == 0 and zero_score_detail_logged_count == MAX_ZERO_SCORE_DETAIL_LOGS:
                             logger.warning(f"Acc {acc_id} resulted in overall_score=0 (Further detail logs suppressed).")
                             zero_score_detail_logged_count += 1

                        # Log if not all required types were found (limited)
                        if num_found_types < len(required_metric_types_set):
                            missing_types = required_metric_types_set - found_metric_types
                            if missing_types_logged_count < MAX_MISSING_TYPE_LOGS:
                                logger.warning(f"Acc {acc_id}: Score based on {num_found_types}/{len(required_metric_types_set)} types. Missing: {', '.join(sorted(list(missing_types)))}")
                                missing_types_logged_count += 1
                            elif missing_types_logged_count == MAX_MISSING_TYPE_LOGS:
                                logger.warning(f"Acc {acc_id}: Score based on incomplete types (Further detail logs suppressed).")
                                missing_types_logged_count += 1
                    else:
                        # Had metrics nearby, but none had valid scores after filtering/selection
                        logger.warning(f"Acc {acc_id}: Score is NULL. Found nearby metric types but none had valid scores for averaging.")
                        # overall_score remains None, num_found_types might be > 0 but useless
                        num_found_types = 0 # Reset count as no score was produced
                
                # If num_found_types is still 0 here, it means either no metrics were nearby
                # OR metrics were nearby but had no valid scores, OR required types were missing.
                # In all these cases, overall_score should be None.
                if num_found_types == 0 and inferred_block_pk is not None: # Check we haven't already handled the 'no metrics nearby' case
                    logger.warning(f"Acc {acc_id}: Score is NULL. No valid required metric types found for scoring within radius.")

                # --- 4e. Prepare Update Payload ---
                updates_to_make.append({
                    'id': acc_id,
                    'overall_safety_score': overall_score, # Will be None if calculation failed
                    'census_block_id': inferred_block_pk, # Use the PK inferred from closest metric
                    'city_id': target_city_id,
                    'safety_metric_types_found': num_found_types if num_found_types > 0 else None # Store count or None
                })
                processed_count += 1

            except (ValueError, TypeError) as coord_err:
                 logger.warning(f"Skipping accommodation {acc.get('id', 'N/A')} in {city_name} due to invalid coordinates or data: {coord_err}")
            except Exception as calc_err:
                logger.error(f"Error calculating score for accommodation {acc.get('id', 'N/A')} in {city_name}: {calc_err}", exc_info=False)
                # Add a placeholder update with nulls if calculation fails mid-way
                updates_to_make.append({
                    'id': acc.get('id', 'N/A'),
                    'overall_safety_score': None,
                    'census_block_id': None,
                    'city_id': target_city_id,
                    'safety_metric_types_found': None
                })
                processed_count += 1 # Ensure it's counted even if it fails

        logger.info(f"Finished calculating scores for {processed_count} accommodations in {city_name}.")
        logger.info(f"  Successfully calculated non-null scores: {scores_calculated_count}")
        logger.info(f"  Accommodations with no metrics nearby: {no_metrics_found_count}")
        if scores_calculated_count == 0 and (processed_count - no_metrics_found_count) > 0:
            logger.critical(f"CRITICAL: No non-null overall safety scores were calculated for any of the {processed_count - no_metrics_found_count} accommodations that had nearby metrics. Check metric data and calculation logic.")
        elif (processed_count - no_metrics_found_count) > scores_calculated_count:
             logger.warning(f"Only {scores_calculated_count} non-null scores calculated out of {processed_count - no_metrics_found_count} accommodations that had nearby metrics. Check 'Missing types' logs.")

        # 5. Batch Update Accommodations via RPC
        if not updates_to_make:
             logger.info("No accommodation updates to perform.")
             return

        logger.info(f"Starting batch RPC updates for {len(updates_to_make)} accommodations using 'update_accommodations_batch'...")
        total_updated_rpc = 0
        total_failed_batches = 0
        total_update_batches = math.ceil(len(updates_to_make) / ACCOMMODATION_UPDATE_BATCH_SIZE)

        for i in range(0, len(updates_to_make), ACCOMMODATION_UPDATE_BATCH_SIZE):
            batch_data = updates_to_make[i:i + ACCOMMODATION_UPDATE_BATCH_SIZE]
            batch_number = (i // ACCOMMODATION_UPDATE_BATCH_SIZE) + 1
            logger.info(f"Calling RPC batch {batch_number}/{total_update_batches} ({len(batch_data)} records) for {city_name}.")
            
            try:
                # Log a sample payload item for debugging
                # if i == 0 and batch_data:
                #    logger.debug(f"Sample RPC Payload Item: {json.dumps(batch_data[0])}")

                rpc_payload = {'updates_json': batch_data} # Ensure matches RPC function parameter name
                update_result = supabase_client.rpc('update_accommodations_batch', rpc_payload).execute()

                # RPC returns the count of updated rows
                if update_result.data is not None and isinstance(update_result.data, int):
                    updated_in_batch = update_result.data
                    total_updated_rpc += updated_in_batch
                    logger.info(f"Batch {batch_number} processed. RPC reported {updated_in_batch} rows updated.")
                    if updated_in_batch != len(batch_data):
                         logger.warning(f"Batch {batch_number} update count mismatch: expected {len(batch_data)}, RPC updated {updated_in_batch}. Some IDs might not have matched or already had same values.")
                elif hasattr(update_result, 'error') and update_result.error:
                    logger.error(f"APIError on update batch {batch_number} RPC call for {city_name}: {update_result.error}")
                    total_failed_batches += 1
                else:
                     logger.warning(f"Update batch {batch_number} RPC for {city_name} returned unexpected data: {update_result.data}")
                     total_failed_batches += 1

            except APIError as api_err:
                 logger.error(f"APIError during update batch {batch_number} RPC call for {city_name}: {api_err}", exc_info=False)
                 total_failed_batches += 1
            except Exception as generic_err:
                 logger.error(f"Generic error during update batch {batch_number} RPC call for {city_name}: {generic_err}", exc_info=True)
                 total_failed_batches += 1
            
            time.sleep(0.1) # Small delay

        logger.info(f"Finished accommodation score update RPC calls for {city_name}.")
        logger.info(f"  Total Attempted Records: {len(updates_to_make)}")
        logger.info(f"  Successfully Updated via RPC: {total_updated_rpc}")
        logger.info(f"  Failed Batches: {total_failed_batches}")
        if total_failed_batches > 0:
             logger.warning("Some accommodation update batches failed entirely. Check logs.")

    except Exception as e:
        logger.error(f"An error occurred during the overall accommodation score update process for {city_name}: {e}", exc_info=True)
    finally:
        logger.info(f"Accommodation score update process finished for {city_name}.")


# --- Main Execution Logic ---
def main(target_city_id: int, test_mode: bool):
    start_time = datetime.now(timezone.utc)
    logger.info(f"====== Starting Safety Metrics Processing run at {start_time.isoformat()} ======")
    logger.info(f"Mode: {'TEST' if test_mode else 'PRODUCTION'}")
    logger.info(f"Target City ID: {target_city_id}")

    if not supabase:
        logger.critical("Supabase client not initialized. Exiting.")
        sys.exit(1)
        
    try:
        # 1. Load Configurations
        logger.info("\n--- STEP 1: Loading Configurations ---")
        load_global_config()
        city_config = load_city_config(target_city_id)
        city_name = city_config.get('city_name', f'ID {target_city_id}')

        # Determine parameters based on mode
        days_back = 300 if test_mode else 800 # Example: 30 days for test, 800 for prod
        max_records = 5000 if test_mode else 500000 # Example: 5k for test, 500k for prod
        logger.info(f"Run Parameters: days_back={days_back}, max_records={max_records:,}")

        # 2. Fetch Crime Data
        logger.info(f"\n--- STEP 2: Fetching Crime Data for {city_name} ---")
        raw_crime_data = fetch_crime_data(city_config, days_back=days_back, max_records=max_records)
        if not raw_crime_data:
            logger.warning(f"No crime data fetched for {city_name}. Pipeline stopped.")
            return # Exit gracefully if no data

        logger.info(f"Fetched {len(raw_crime_data):,} raw crime records.")

        # 3. Process Crime Data
        logger.info(f"\n--- STEP 3: Processing and Mapping Crime Data ---")
        processed_df = process_crime_data(raw_crime_data, city_config)
        del raw_crime_data # Free memory

        if processed_df is None or processed_df.empty:
            logger.error(f"Crime data processing failed or yielded no results for {city_name}. Pipeline stopped.")
            return

        logger.info(f"Processed data yielded {len(processed_df):,} records for metric calculation.")

        # 4. Calculate Safety Metrics
        logger.info(f"\n--- STEP 4: Calculating Safety Metrics ---")
        metrics_by_type = calculate_metrics(processed_df, target_city_id, city_config)
        del processed_df # Free memory
        total_metrics = sum(len(m) for m in metrics_by_type.values())

        if total_metrics == 0:
            logger.warning(f"No safety metrics were generated for {city_name}.")
            # Decide if we should still proceed to upload (which will delete old) and update accommodations
        else:
            logger.info(f"Generated {total_metrics:,} total metrics across {len(metrics_by_type)} types for {city_name}.")

        # 5. Upload Metrics
        logger.info(f"\n--- STEP 5: Uploading Safety Metrics ---")
        upload_metrics(metrics_by_type, target_city_id=target_city_id, test_mode=test_mode)

        # 6. Update Accommodation Scores
        logger.info(f"\n--- STEP 6: Updating Accommodation Scores ---")
        if test_mode:
             logger.info("[TEST MODE] Skipping accommodation score updates.")
        else:
            # Nested try-except for accommodation update to allow main process to finish
            try:
                update_accommodation_safety_scores(supabase, target_city_id)
            except Exception as score_update_err:
                # Log error but don't stop the entire process if this fails
                logger.error(f"Failed to update accommodation scores for {city_name}: {score_update_err}", exc_info=True)

        # --- Completion ---
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        logger.info(f"\n====== Safety Metrics Processing COMPLETED for City: {city_name} (ID: {target_city_id}) ======")
        logger.info(f"Total execution time: {duration:.2f} seconds ({duration / 60.0:.2f} minutes)")

    except Exception as e:
        logger.critical(f"An unhandled error occurred in the main execution pipeline for city {target_city_id}: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process safety metrics for a specific city (Refactored Version).")
    parser.add_argument("--city-id", type=int, required=True, help="The ID of the city to process (from the 'cities' table).")
    parser.add_argument("--test-mode", action="store_true", help="Run in test mode (uses smaller dataset parameters, skips database writes).")
    args = parser.parse_args()

    main(target_city_id=args.city_id, test_mode=args.test_mode) 