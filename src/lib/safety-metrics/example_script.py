#!/usr/bin/env python3
"""
Safety Metrics Processor for LA Crime Data
Enhanced version with block group alignment and spatial indexing
"""

import os
import json
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import time
from tqdm import tqdm
import sys
import logging
from census_helper import CensusHelper
from typing import Dict, List, Optional, Tuple
from sodapy import Socrata

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
LA_APP_TOKEN = os.environ.get("LA_APP_TOKEN")  # LA City Data app token
LA_APP_SECRET = os.environ.get("LA_APP_SECRET")  # LA City Data app secret

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env file")
    sys.exit(1)

if not LA_APP_TOKEN:
    print("Warning: Missing LA_APP_TOKEN in .env file. Requests will be subject to strict throttling limits.")

# LAPD API configuration
LAPD_DOMAIN = "data.lacity.org"
LAPD_DATASET_ID = "2nrs-mtv8"

# Initialize clients
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    census_helper = CensusHelper()
    
    # Initialize Socrata client with authentication
    if LA_APP_TOKEN and LA_APP_SECRET:
        socrata_client = Socrata(LAPD_DOMAIN, LA_APP_TOKEN, username=None, password=None)
        socrata_client.session.headers.update({'X-App-Token': LA_APP_TOKEN})  # Add token to headers for higher limits
    else:
        socrata_client = Socrata(LAPD_DOMAIN, None)
except Exception as e:
    print(f"Error initializing clients: {str(e)}")
    sys.exit(1)

# Define LA bounds
LA_BOUNDS = {
    'lat': (33.70, 34.83),
    'lon': (-118.67, -117.65)
}

# Define safety metric types and their questions
SAFETY_METRICS = {
    'night': {
        'question': 'Can I go outside after dark?',
        'description': 'Safety for pedestrians during evening/night hours',
        'crime_codes': ['210', '220', '230', '231', '235', '236', '250', '251', '761', '762', '763', '860'],
        'time_filter': lambda hour: hour >= 18 or hour < 6  # 6 PM to 6 AM
    },
    'vehicle': {
        'question': 'Can I park here safely?',
        'description': 'Risk of vehicle theft and break-ins',
        'crime_codes': ['330', '331', '410', '420', '421', '330', '331', '440', '441', '442', '443', '444', '445']
    },
    'child': {
        'question': 'Are kids safe here?',
        'description': 'Overall safety concerning crimes that could affect children',
        'crime_codes': ['235', '236', '627', '760', '762', '922', '237', '812', '813', '814', '815']
    },
    'transit': {
        'question': 'Is it safe to use public transport?',
        'description': 'Safety at and around transit locations',
        'crime_codes': ['210', '220', '230', '231', '476', '946', '761', '762', '763', '475', '352']
    },
    'women': {
        'question': 'Would I be harassed here?',
        'description': 'Assessment of crimes that disproportionately affect women',
        'crime_codes': ['121', '122', '815', '820', '821', '236', '626', '627', '647', '860', '921', '922']
    }
}

def print_section(title):
    """Print a section header"""
    print(f"\n{'='*80}\n{title}\n{'='*80}")

def fetch_crime_data(days_back=90):
    """Fetch recent crime data from LAPD API using SODA client"""
    print_section("Fetching Crime Data")
    
    # Focus on 4 months before NIBRS transition (Nov 7, 2023 - March 6, 2024)
    end_date = datetime(2024, 3, 6)  # Day before NIBRS transition
    start_date = end_date - timedelta(days=30)  # 1 month
    
    # Format dates for SODA API
    start_date_str = start_date.strftime('%Y-%m-%dT00:00:00.000')
    end_date_str = end_date.strftime('%Y-%m-%dT23:59:59.999')
    
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    print("Note: Using data before NIBRS transition for consistent reporting.")
    
    try:
        # Use the global socrata_client initialized with app token
        global socrata_client
        
        # Prepare the query
        where_clause = f"date_occ between '{start_date_str}' and '{end_date_str}'"
        
        # Get total count first
        count_query = socrata_client.get(LAPD_DATASET_ID, select="COUNT(*)", where=where_clause)
        total_records = int(count_query[0]['COUNT'])
        print(f"\nTotal records available: {total_records:,}")
        
        # Fetch data in batches
        all_data = []
        batch_size = 50000  # Maximum for SODA 2.0
        offset = 0
        
        with tqdm(total=total_records, desc="Fetching records", unit="records") as pbar:
            while offset < total_records:
                try:
                    # Fetch batch with order by date_occ
                    batch = socrata_client.get(
                        LAPD_DATASET_ID,
                        where=where_clause,
                        order="date_occ DESC",
                        limit=batch_size,
                        offset=offset
                    )
                    
                    if not batch:
                        break
                    
                    all_data.extend(batch)
                    batch_len = len(batch)
                    pbar.update(batch_len)
                    
                    print(f"\nBatch size: {batch_len}")
                    if batch_len > 0:
                        print(f"First record date: {batch[0].get('date_occ')}")
                        print(f"Last record date: {batch[-1].get('date_occ')}")
                    
                    if batch_len < batch_size:
                        break
                    
                    offset += batch_size
                    time.sleep(0.5)  # Reduced rate limiting since we have an app token
                    
                except Exception as e:
                    print(f"\nError fetching batch at offset {offset}: {str(e)}")
                    if len(all_data) > 0:
                        print(f"Proceeding with {len(all_data)} records fetched so far...")
                        break
                    else:
                        raise
        
        print(f"\nFetch complete. Total records fetched: {len(all_data):,}")
        
        # Print date range of fetched data
        if all_data:
            dates = [datetime.fromisoformat(record['date_occ'].replace('Z', '+00:00')) 
                    for record in all_data 
                    if record.get('date_occ')]
            if dates:
                print(f"Actual date range in data: {min(dates).date()} to {max(dates).date()}")
                print(f"Records by month:")
                month_counts = {}
                for date in dates:
                    month_key = date.strftime('%Y-%m')
                    month_counts[month_key] = month_counts.get(month_key, 0) + 1
                for month in sorted(month_counts.keys()):
                    print(f"  {month}: {month_counts[month]:,} records")
        
        return all_data
        
    except Exception as e:
        print(f"Error in fetch_crime_data: {str(e)}")
        raise
    finally:
        if 'socrata_client' in globals():
            socrata_client.close()

def validate_coordinate(lat: float, lon: float) -> bool:
    """Validate if coordinates are within reasonable bounds and not null island"""
    try:
        return (
            isinstance(lat, (int, float)) and
            isinstance(lon, (int, float)) and
            -90 <= lat <= 90 and
            -180 <= lon <= 180 and
            not (abs(lat) < 0.0001 and abs(lon) < 0.0001)  # Avoid null island
        )
    except (TypeError, ValueError):
        return False

def process_crime_data(crime_data: List[Dict]) -> pd.DataFrame:
    """Process crime data and add block group information."""
    print("\nProcessing Crime Data")
    print("=" * 80)
    
    print(f"Initial records: {len(crime_data)}")
    
    # Convert to DataFrame for easier processing
    df = pd.DataFrame(crime_data)
    
    print("\nValidating dates...")
    # Ensure date_occ is datetime
    df['date_occ'] = pd.to_datetime(df['date_occ'])
    df['hour'] = df['date_occ'].dt.hour
    
    print("Validating coordinates...")
    # Ensure lat/lon are numeric
    df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
    df['lon'] = pd.to_numeric(df['lon'], errors='coerce')
    
    # Validate coordinates
    valid_coords = df.apply(
        lambda row: validate_coordinate(row['lat'], row['lon']),
        axis=1
    )
    df = df[valid_coords]
    print(f"Valid coordinates: {len(df)}")
    
    # Filter to LA boundaries
    bounds_mask = (
        (df['lat'].between(*LA_BOUNDS['lat'])) & 
        (df['lon'].between(*LA_BOUNDS['lon']))
    )
    df = df[bounds_mask]
    print(f"Records within LA bounds: {len(df)}")
    
    if len(df) == 0:
        raise ValueError("No valid records found after filtering")
    
    print("\nFetching block group data...")
    try:
        # Get unique coordinates to reduce API calls
        unique_coords = df[['lat', 'lon']].drop_duplicates()
        coordinates = list(zip(unique_coords['lat'], unique_coords['lon']))
        print(f"Unique locations to process: {len(coordinates)}")
        
        # Get block groups for unique coordinates
        census_helper = CensusHelper()
        block_groups = census_helper.get_block_groups_batch(coordinates)
        
        if not block_groups:
            raise ValueError("No block groups returned from Census API")
        
        # Create a mapping dictionary for faster lookups
        coord_to_block = {}
        for lat, lon in coordinates:
            cache_key = f"{lat:.6f},{lon:.6f}"
            if cache_key in block_groups:
                coord_to_block[cache_key] = block_groups[cache_key]
        
        print(f"Successfully mapped {len(coord_to_block)} locations to block groups")
        
        # Add block group information to DataFrame
        df['block_group'] = df.apply(
            lambda row: coord_to_block.get(f"{row['lat']:.6f},{row['lon']:.6f}"),
            axis=1
        )
        
        # Drop rows without block group
        df = df.dropna(subset=['block_group'])
        print(f"\nFinal records with block groups: {len(df)}")
        
        if len(df) == 0:
            raise ValueError("No records remain after adding block groups")
        
        return df
        
    except Exception as e:
        logger.error(f"Error processing crime data: {str(e)}")
        raise

def calculate_block_group_stats(df: pd.DataFrame, metric_type: str) -> Dict[str, Dict]:
    """Calculate crime statistics for each block group"""
    try:
        metric_info = SAFETY_METRICS[metric_type]
        crime_codes = metric_info['crime_codes']
        
        # Filter for relevant crimes
        metric_df = df[df['crm_cd'].isin(crime_codes)].copy()
        
        if len(metric_df) == 0:
            logger.warning(f"No crimes found for metric type: {metric_type}")
            return {}
        
        if 'time_filter' in metric_info:
            metric_df = metric_df[metric_df['hour'].apply(metric_info['time_filter'])]
        
        # Group by block group
        stats = metric_df.groupby('block_group').agg({
            'crm_cd': 'count'
        }).reset_index()
        
        if len(stats) == 0:
            logger.warning(f"No block groups found for metric type: {metric_type}")
            return {}
        
        # Calculate rates and scores
        total_crimes = stats['crm_cd'].sum()
        citywide_rate = total_crimes / len(stats) if len(stats) > 0 else 0
        
        results = {}
        for _, row in stats.iterrows():
            block_group_id = row['block_group']
            crimes_count = row['crm_cd']
            
            # Calculate score
            score = calculate_safety_score(crimes_count, total_crimes, citywide_rate)
            
            results[block_group_id] = {
                'crimes_count': int(crimes_count),
                'score': score
            }
        
        return results
        
    except Exception as e:
        logger.error(f"Error calculating stats for {metric_type}: {str(e)}")
        raise

def get_risk_level_description(
    metric_type: str,
    score: int,
    incidents: int,
    local_rate: float,
    relative_rate: float
) -> str:
    """Generate a description of the risk level"""
    try:
        score = int(score)
        risk_level = "Very safe area" if score >= 8 else \
                    "Generally safe area" if score >= 6 else \
                    "Exercise caution" if score >= 4 else \
                    "Extra caution advised"
        
        description = f"{risk_level}. {SAFETY_METRICS[metric_type]['description']}"
        
        # Add statistical context
        stats_info = f" [{incidents} incidents"
        if relative_rate > 0:
            stats_info += f", {relative_rate:.1f}x city average"
        stats_info += "]"
        
        return f"{description}{stats_info}"
        
    except Exception as e:
        logger.error(f"Error in description: {str(e)}")
        return "Unable to determine risk level"

def calculate_safety_score(crimes_count: int, total_crimes: int, citywide_rate: float) -> int:
    """Calculate a normalized safety score (2-8 scale)"""
    if total_crimes == 0:
        return 8
    
    local_rate = crimes_count / total_crimes
    relative_rate = local_rate / citywide_rate if citywide_rate > 0 else 1
    
    # Enhanced scoring logic with smoother transitions
    if relative_rate <= 0.5:
        return 8
    elif relative_rate <= 0.8:
        return 7
    elif relative_rate <= 1.2:
        return 6
    elif relative_rate <= 1.5:
        return 5
    elif relative_rate <= 2.0:
        return 4
    elif relative_rate <= 3.0:
        return 3
    else:
        return 2

def main():
    """Main execution flow"""
    try:
        # Fetch and process crime data
        crime_data = fetch_crime_data(days_back=90)
        df = process_crime_data(crime_data)
        
        print_section("Calculating Safety Metrics")
        
        # Process each metric type
        metric_types = list(SAFETY_METRICS.keys())
        with tqdm(total=len(metric_types), desc="Processing metric types", unit="type") as pbar_types:
            for metric_type in metric_types:
                print(f"\nProcessing {metric_type} safety metrics...")
                
                # Calculate block group statistics
                block_group_stats = calculate_block_group_stats(df, metric_type)
                
                if not block_group_stats:
                    print(f"No data available for {metric_type} metrics")
                    pbar_types.update(1)
                    continue
                
                # Prepare metrics for upload
                metrics = []
                total_block_groups = len(block_group_stats)
                print(f"Generating metrics for {total_block_groups} block groups...")
                
                with tqdm(total=total_block_groups, desc=f"Generating {metric_type} metrics", unit="block") as pbar_blocks:
                    for block_group_id, stats in block_group_stats.items():
                        try:
                            # Calculate centroid of block group (using first crime location as approximation)
                            block_group_crimes = df[df['block_group'] == block_group_id]
                            if len(block_group_crimes) == 0:
                                pbar_blocks.update(1)
                                continue
                            
                            lat = block_group_crimes['lat'].mean()
                            lon = block_group_crimes['lon'].mean()
                            
                            # Calculate relative rates
                            total_crimes = df['crm_cd'].count()
                            total_block_groups = len(block_group_stats)
                            local_rate = stats['crimes_count'] / total_crimes if total_crimes > 0 else 0
                            avg_crimes_per_block = total_crimes / total_block_groups if total_block_groups > 0 else 0
                            relative_rate = (stats['crimes_count'] / avg_crimes_per_block) if avg_crimes_per_block > 0 else 0
                            
                            # Get demographic data for the block group
                            pop_data = census_helper.get_population_for_block_group(block_group_id)
                            
                            metric = {
                                'id': str(uuid.uuid4()),
                                'latitude': float(lat),
                                'longitude': float(lon),
                                'metric_type': metric_type,
                                'score': stats['score'],
                                'question': SAFETY_METRICS[metric_type]['question'],
                                'description': get_risk_level_description(
                                    metric_type,
                                    stats['score'],
                                    stats['crimes_count'],
                                    local_rate,
                                    relative_rate
                                ),
                                'block_group_id': block_group_id,
                                'created_at': datetime.now().isoformat(),
                                'expires_at': (datetime.now() + timedelta(days=90)).isoformat()
                            }
                            
                            # Add demographic data if available
                            if pop_data:
                                metric.update({
                                    'total_population': pop_data.get('total_population'),
                                    'housing_units': pop_data.get('housing_units'),
                                    'median_age': pop_data.get('median_age'),
                                    'incidents_per_1000': round((stats['crimes_count'] / pop_data['total_population']) * 1000, 2) if pop_data['total_population'] > 0 else None
                                })
                            
                            metrics.append(metric)
                            pbar_blocks.update(1)
                            
                        except Exception as e:
                            logger.error(f"Error processing block group {block_group_id}: {str(e)}")
                            pbar_blocks.update(1)
                            continue
                
                print(f"Generated {len(metrics)} metrics for {metric_type}")
                
                # Upload to Supabase in batches
                if metrics:
                    batch_size = 100
                    total_batches = (len(metrics) + batch_size - 1) // batch_size
                    
                    with tqdm(total=total_batches, desc=f"Uploading {metric_type} metrics", unit="batch") as pbar_upload:
                        for i in range(0, len(metrics), batch_size):
                            batch = metrics[i:i + batch_size]
                            try:
                                supabase.table('safety_metrics').upsert(batch).execute()
                                pbar_upload.update(1)
                            except Exception as e:
                                print(f"Error uploading batch: {str(e)}")
                                pbar_upload.update(1)
                
                pbar_types.update(1)
        
        print("\nProcessing complete!")
        
    except Exception as e:
        print(f"Error in main execution: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main() 