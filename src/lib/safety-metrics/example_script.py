#!/usr/bin/env python3
"""
Safety Metrics Processor for LA Crime Data
Initial version focusing on core functionality:
1. Fetch crime data from LA API
2. Basic processing and validation
3. Upload to Supabase
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

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env file")
    sys.exit(1)

# LAPD API endpoint
LAPD_API_URL = "https://data.lacity.org/resource/2nrs-mtv8.json"

# Initialize Supabase client
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error initializing Supabase client: {str(e)}")
    sys.exit(1)

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
    """Fetch recent crime data from LAPD API"""
    print_section("Fetching Crime Data")
    
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    
    all_data = []
    offset = 0
    limit = 1000
    
    with tqdm(desc="Fetching records", unit="records") as pbar:
        while True:
            try:
                # Query parameters
                params = {
                    "$limit": limit,
                    "$offset": offset,
                    "$where": f"date_occ >= '{start_date.strftime('%Y-%m-%d')}'"
                }
                
                response = requests.get(LAPD_API_URL, params=params)
                response.raise_for_status()
                
                batch = response.json()
                if not batch:
                    break
                    
                all_data.extend(batch)
                pbar.update(len(batch))
                
                if len(batch) < limit:
                    break
                    
                offset += limit
                
            except Exception as e:
                print(f"\nError fetching data: {str(e)}")
                break
    
    print(f"\nFetch complete. Total records: {len(all_data):,}")
    return all_data

def process_crime_data(crime_data):
    """Basic processing of crime data"""
    print_section("Processing Crime Data")
    
    print("Initial records:", len(crime_data))
    
    # Convert to DataFrame
    df = pd.DataFrame(crime_data)
    
    # Data validation statistics
    stats = {
        'total_initial': len(df),
        'invalid_dates': 0,
        'invalid_coords': 0,
        'outside_bounds': 0
    }
    
    # Convert date and time
    print("\nValidating dates...")
    df['date_occ'] = pd.to_datetime(df['date_occ'], errors='coerce')
    stats['invalid_dates'] = df['date_occ'].isna().sum()
    df = df.dropna(subset=['date_occ'])
    
    df['hour'] = df['date_occ'].dt.hour
    
    # Convert coordinates
    print("Validating coordinates...")
    df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
    df['lon'] = pd.to_numeric(df['lon'], errors='coerce')
    
    # Count invalid coordinates
    stats['invalid_coords'] = df[['lat', 'lon']].isna().any(axis=1).sum()
    df = df.dropna(subset=['lat', 'lon'])
    
    # Filter to LA boundaries
    bounds_mask = (
        (df['lat'].between(33.70, 34.83)) & 
        (df['lon'].between(-118.67, -117.65))
    )
    stats['outside_bounds'] = (~bounds_mask).sum()
    df = df[bounds_mask]
    
    # Print statistics
    print("\nData Processing Statistics:")
    print(f"Initial records: {stats['total_initial']:,}")
    print(f"Invalid dates: {stats['invalid_dates']:,}")
    print(f"Invalid coordinates: {stats['invalid_coords']:,}")
    print(f"Outside LA bounds: {stats['outside_bounds']:,}")
    print(f"Final valid records: {len(df):,}")
    
    # Print date range
    if not df.empty:
        print(f"\nDate range in processed data:")
        print(f"Earliest: {df['date_occ'].min()}")
        print(f"Latest: {df['date_occ'].max()}")
    
    return df

def get_risk_level_description(metric_type: str, score: int, incidents: int, local_rate: float, relative_rate: float, population_data: dict = None) -> str:
    """Generate a description of the risk level for a safety metric."""
    try:
        score = int(score)  # Ensure score is an integer
        risk_level = "Very safe area" if score >= 8 else \
                    "Generally safe area" if score >= 6 else \
                    "Exercise caution" if score >= 4 else \
                    "Extra caution advised"
        
        type_descriptions = {
            'night': "Safety for pedestrians during evening/night hours",
            'vehicle': "Risk of vehicle theft and break-ins",
            'child': "Overall safety concerning crimes that could affect children",
            'transit': "Safety at and around transit locations",
            'women': "Assessment of crimes that disproportionately affect women"
        }
        
        # Base description
        description = f"{risk_level}. {type_descriptions[metric_type]}"
        
        # Add debug info
        debug_info = f"[Debug: {incidents} incidents in area, {local_rate:.3f} local rate, {relative_rate:.2f}x city average"
        
        # Add population context if available
        if population_data and population_data.get('total_population'):
            pop = population_data['total_population']
            rate_per_1000 = (incidents / pop) * 1000 if pop > 0 else 0
            debug_info += f", {pop:,} residents, {rate_per_1000:.1f} incidents per 1000 people"
        
        debug_info += "]"
        
        return f"{description} {debug_info}"
        
    except (ValueError, TypeError) as e:
        logger.error(f"Error in get_risk_level_description: {str(e)}, score: {score}, type: {type(score)}")
        return "Unable to determine risk level"

def calculate_safety_score(crimes_count, total_crimes, citywide_rate=None):
    """Calculate a safety score between 2-8"""
    if total_crimes == 0:
        return 8
    
    # Calculate the crime rate for this metric in this cell
    crime_rate = crimes_count / total_crimes
    
    if citywide_rate is not None:
        # Compare to citywide average
        relative_rate = crime_rate / citywide_rate if citywide_rate > 0 else 1
        
        if relative_rate <= 0.5:  # Much safer than average
            return 8
        elif relative_rate <= 0.8:  # Safer than average
            return 7
        elif relative_rate <= 1.2:  # Average
            return 6
        elif relative_rate <= 1.5:  # Somewhat worse than average
            return 5
        elif relative_rate <= 2.0:  # Worse than average
            return 4
        elif relative_rate <= 3.0:  # Much worse than average
            return 3
        else:  # Extremely high crime rate
            return 2
    else:
        # Fallback scoring based on local crime rate only
        if crime_rate <= 0.1:
            return 8
        elif crime_rate <= 0.2:
            return 7
        elif crime_rate <= 0.3:
            return 6
        elif crime_rate <= 0.4:
            return 5
        elif crime_rate <= 0.5:
            return 4
        elif crime_rate <= 0.6:
            return 3
        else:
            return 2

def calculate_safety_metrics(df):
    """Calculate safety metrics with improved scoring"""
    print_section("Calculating Safety Metrics")
    
    metrics = []
    
    # Initialize Census helper
    try:
        census = CensusHelper()
        has_census = True
    except ValueError as e:
        print("\nWarning: Census API key not found. Continuing without population data.")
        has_census = False
    
    # Grid the area into 0.01 degree squares (roughly 1km)
    lats = np.arange(33.70, 34.83, 0.01)
    lons = np.arange(-118.67, -117.65, 0.01)
    
    total_cells = len(lats) * len(lons)
    cells_with_data = 0
    total_metrics = 0
    
    # Calculate citywide statistics for each metric type
    print("Calculating citywide statistics...")
    citywide_stats = {}
    total_crimes = len(df)
    
    for metric_type, config in SAFETY_METRICS.items():
        crimes = df[df['crm_cd'].isin(config['crime_codes'])]
        if 'time_filter' in config:
            crimes = crimes[crimes['hour'].apply(config['time_filter'])]
        citywide_stats[metric_type] = len(crimes) / total_crimes if total_crimes > 0 else 0
        print(f"{metric_type}: {len(crimes):,} total incidents, {citywide_stats[metric_type]:.3f} citywide rate")
    
    print(f"\nProcessing {total_cells:,} grid cells...")
    
    with tqdm(total=total_cells, desc="Processing grid cells") as pbar:
        for lat in lats:
            for lon in lons:
                # Filter crimes in this grid cell
                mask = (
                    (df['lat'].between(lat, lat + 0.01)) &
                    (df['lon'].between(lon, lon + 0.01))
                )
                grid_crimes = df[mask]
                
                if len(grid_crimes) > 0:
                    cells_with_data += 1
                    
                    # Get Census data if available
                    census_data = None
                    if has_census:
                        try:
                            census_data = census.get_population_for_location(
                                float(lat + 0.005),
                                float(lon + 0.005)
                            )
                        except Exception as e:
                            # Silently continue without Census data
                            pass
                    
                    # Calculate metrics for each type
                    for metric_type, config in SAFETY_METRICS.items():
                        crimes = grid_crimes[grid_crimes['crm_cd'].isin(config['crime_codes'])]
                        
                        # Apply time filter for night safety
                        if 'time_filter' in config:
                            crimes = crimes[crimes['hour'].apply(config['time_filter'])]
                        
                        if len(crimes) == 0:
                            continue
                        
                        # Calculate incidents per 1000 people if population data available
                        incidents_per_1000 = None
                        if census_data and census_data.get('total_population', 0) > 0:
                            incidents_per_1000 = (len(crimes) / census_data['total_population']) * 1000
                        
                        # Calculate score using citywide statistics
                        score = calculate_safety_score(
                            len(crimes),
                            len(grid_crimes),
                            citywide_stats[metric_type]
                        )
                        
                        # Get detailed description with debug info
                        description = get_risk_level_description(
                            metric_type,
                            score,
                            len(crimes),
                            len(crimes) / len(grid_crimes) if len(grid_crimes) > 0 else 0,
                            citywide_stats[metric_type],
                            census_data
                        )
                        
                        metric = {
                            'id': str(uuid.uuid4()),
                            'latitude': float(lat + 0.005),
                            'longitude': float(lon + 0.005),
                            'metric_type': metric_type,
                            'score': score,
                            'question': config['question'],
                            'description': description,
                            'created_at': datetime.now().isoformat(),
                            'expires_at': (datetime.now() + timedelta(days=30)).isoformat()
                        }
                        
                        # Add Census data if available
                        if census_data:
                            metric.update({
                                'total_population': census_data.get('total_population'),
                                'housing_units': census_data.get('housing_units'),
                                'median_age': census_data.get('median_age'),
                                'incidents_per_1000': round(incidents_per_1000, 2) if incidents_per_1000 is not None else None
                            })
                        
                        metrics.append(metric)
                        total_metrics += 1
                
                pbar.update(1)
    
    # Print statistics about metric distribution
    print(f"\nMetrics Generation Summary:")
    print(f"Total grid cells: {total_cells:,}")
    print(f"Cells with crime data: {cells_with_data:,}")
    print(f"Total metrics generated: {total_metrics:,}")
    
    # Print distribution of metrics by type
    print("\nMetrics distribution by type:")
    metric_counts = {}
    for metric in metrics:
        metric_counts[metric['metric_type']] = metric_counts.get(metric['metric_type'], 0) + 1
    
    for metric_type, count in metric_counts.items():
        print(f"{metric_type}: {count:,} metrics ({count/total_metrics*100:.1f}%)")
    
    # Print score distribution
    print("\nScore distribution:")
    score_counts = {}
    for metric in metrics:
        score_counts[metric['score']] = score_counts.get(metric['score'], 0) + 1
    
    for score in sorted(score_counts.keys()):
        count = score_counts[score]
        print(f"Score {score}: {count:,} metrics ({count/total_metrics*100:.1f}%)")
    
    # Print Census data coverage
    census_coverage = len([m for m in metrics if m['total_population'] is not None])
    print(f"\nCensus data coverage: {census_coverage} metrics ({census_coverage/total_metrics*100:.1f}%)")
    
    return metrics

def upload_to_supabase(metrics):
    """Upload metrics to Supabase"""
    print_section("Uploading to Supabase")
    
    if not metrics:
        print("No metrics to upload")
        return False
    
    try:
        # Clear existing metrics first
        print("Clearing existing metrics...")
        supabase.table('safety_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        
        # Upload in batches
        batch_size = 50
        total_batches = (len(metrics) + batch_size - 1) // batch_size
        
        print(f"\nUploading {len(metrics):,} metrics in {total_batches:,} batches...")
        
        with tqdm(total=len(metrics), desc="Uploading metrics") as pbar:
            for i in range(0, len(metrics), batch_size):
                batch = metrics[i:i+batch_size]
                supabase.table('safety_metrics').upsert(batch).execute()
                pbar.update(len(batch))
        
        print(f"\nSuccessfully uploaded {len(metrics):,} metrics")
        return True
    except Exception as e:
        print(f"\nError uploading metrics: {str(e)}")
        return False

def process_metrics(crime_data: pd.DataFrame, grid_cells: pd.DataFrame) -> list:
    """Process crime data and generate safety metrics."""
    logger.info("\nCalculating Safety Metrics")
    
    # Initialize Census helper
    census = CensusHelper()
    
    # Calculate citywide statistics
    total_crimes = len(crime_data)
    crime_types = {
        'night': crime_data[crime_data['is_night'] == True],
        'vehicle': crime_data[crime_data['is_vehicle'] == True],
        'child': crime_data[crime_data['is_child'] == True],
        'transit': crime_data[crime_data['is_transit'] == True],
        'women': crime_data[crime_data['is_women'] == True]
    }
    
    # Print citywide statistics
    logger.info("\nCitywide statistics:")
    for crime_type, data in crime_types.items():
        rate = len(data) / total_crimes if total_crimes > 0 else 0
        logger.info(f"{crime_type}: {len(data)} total incidents, {rate:.3f} citywide rate")
    
    metrics = []
    cells_with_crime = set()
    
    logger.info("\nProcessing grid cells...")
    for _, cell in tqdm(grid_cells.iterrows(), total=len(grid_cells)):
        cell_crimes = get_crimes_in_cell(crime_data, cell)
        if len(cell_crimes) == 0:
            continue
            
        cells_with_crime.add((cell['latitude'], cell['longitude']))
        
        # Calculate metrics for each crime type
        for metric_type, type_data in crime_types.items():
            cell_type_crimes = cell_crimes[cell_crimes.index.isin(type_data.index)]
            if len(cell_type_crimes) == 0:
                continue
                
            local_rate = len(cell_type_crimes) / len(cell_crimes)
            citywide_rate = len(type_data) / total_crimes if total_crimes > 0 else 0
            relative_rate = local_rate / citywide_rate if citywide_rate > 0 else 0
            
            score = calculate_safety_score(len(cell_type_crimes), local_rate, relative_rate)
            
            metric = {
                'latitude': cell['latitude'],
                'longitude': cell['longitude'],
                'metric_type': metric_type,
                'score': score,
                'question': get_question_for_type(metric_type),
                'description': get_risk_level_description(
                    metric_type, score, len(cell_type_crimes),
                    local_rate, relative_rate
                ),
                'created_at': datetime.now().isoformat(),
                'expires_at': (datetime.now() + timedelta(days=30)).isoformat()
            }
            metrics.append(metric)
    
    # Enrich metrics with population data
    logger.info("\nEnriching metrics with population data...")
    enriched_metrics = census.enrich_safety_metrics(metrics)
    
    # Log metrics generation summary
    logger.info("\nMetrics Generation Summary:")
    logger.info(f"Total grid cells: {len(grid_cells)}")
    logger.info(f"Cells with crime data: {len(cells_with_crime)}")
    logger.info(f"Total metrics generated: {len(enriched_metrics)}")
    
    # Log metrics distribution by type
    type_counts = {}
    for metric in enriched_metrics:
        type_counts[metric['metric_type']] = type_counts.get(metric['metric_type'], 0) + 1
    
    logger.info("\nMetrics distribution by type:")
    for metric_type, count in type_counts.items():
        percentage = (count / len(enriched_metrics)) * 100
        logger.info(f"{metric_type}: {count} metrics ({percentage:.1f}%)")
    
    # Log score distribution
    score_counts = {}
    for metric in enriched_metrics:
        score_counts[metric['score']] = score_counts.get(metric['score'], 0) + 1
    
    logger.info("\nScore distribution:")
    for score in sorted(score_counts.keys()):
        count = score_counts[score]
        percentage = (count / len(enriched_metrics)) * 100
        logger.info(f"Score {score}: {count} metrics ({percentage:.1f}%)")
    
    return enriched_metrics

def main():
    """Main function to process safety metrics"""
    start_time = time.time()
    
    print_section("Safety Metrics Processing Started")
    print(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Fetch recent crime data (last 90 days)
    crime_data = fetch_crime_data(days_back=90)
    
    if not crime_data:
        print("No crime data available. Exiting.")
        return
    
    # Process data
    df = process_crime_data(crime_data)
    
    if len(df) == 0:
        print("No valid crime data after processing. Exiting.")
        return
    
    # Calculate metrics
    metrics = calculate_safety_metrics(df)
    
    if not metrics:
        print("No metrics generated. Exiting.")
        return
    
    # Upload to Supabase
    success = upload_to_supabase(metrics)
    
    # Print completion summary
    print_section("Processing Complete")
    if success:
        print("✅ Safety metrics processing completed successfully!")
    else:
        print("❌ Error occurred during processing")
    
    elapsed_time = time.time() - start_time
    print(f"\nTotal processing time: {elapsed_time:.2f} seconds")

if __name__ == "__main__":
    main() 