#!/usr/bin/env python3
"""
Census Block Fetcher Script

This script fetches census blocks directly from the US Census API and populates
the census_blocks table in Supabase with real demographic data.
It first clears existing records and then fetches new ones.
It also integrates with TIGER/Line files to get accurate MultiPolygon geometries.
"""

import os
import time
import requests
import logging
import json
import csv
import argparse
import tempfile
import zipfile
import geopandas as gpd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.wkt import loads

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("census_fetch.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('census_fetch')

# Load environment variables
load_dotenv()

# Census API configuration
CENSUS_API_KEY = "ebdf6f2ebfed1b953612f94dba077e3e87bb012d"
CENSUS_DATA_URL = "https://api.census.gov/data/2022/acs/acs5"
TIGER_BASE_URL = "https://www2.census.gov/geo/tiger/TIGER2022"

# Supabase configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Rate limiting settings
MIN_DELAY = 1.5  # seconds between API calls (increased from 1.0)
BATCH_SIZE = 100  # Number of items to process in each batch

class CensusFetcher:
    def __init__(self):
        # Initialize Supabase client
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Initialize API session with proper headers
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        
        # Rate limiting attributes
        self.last_api_call = 0
        
        # Statistics
        self.successful_fetches = 0
        self.failed_fetches = 0
        self.total_records_added = 0
        
        # Store block group geometries
        self.block_group_geometries = {}

    def _rate_limit(self):
        """Implement rate limiting for API calls"""
        now = time.time()
        elapsed = now - self.last_api_call
        
        # More conservative rate limiting - wait at least 1.5 seconds between requests
        # This helps prevent "Too Many Requests" errors
        if elapsed < MIN_DELAY:
            wait_time = MIN_DELAY - elapsed
            logger.debug(f"Rate limiting: waiting {wait_time:.2f} seconds")
            time.sleep(wait_time)
            
        self.last_api_call = time.time()

    def clear_existing_data(self):
        """Clear all existing census blocks from the database"""
        try:
            logger.info("Clearing existing census blocks data...")
            # We need to use a WHERE clause to delete all records
            result = self.supabase.table('census_blocks').delete().neq('id', '').execute()
            logger.info(f"Cleared all existing census blocks data")
            return True
        except Exception as e:
            logger.error(f"Error clearing existing data: {str(e)}")
            return False

    def download_tiger_shapefile(self, state_fips="06", year="2022"):
        """
        Download block group shapefile from Census TIGER/Line
        
        Args:
            state_fips: State FIPS code (default: 06 for California)
            year: Year of TIGER/Line data (default: 2022)
        
        Returns:
            Path to downloaded shapefile
        """
        try:
            # Construct URL for block group shapefile
            # Format: tl_YYYY_SS_bg.zip where YYYY=year, SS=state FIPS
            url = f"{TIGER_BASE_URL}/BG/tl_{year}_{state_fips}_bg.zip"
            
            logger.info(f"Downloading TIGER/Line shapefile from {url}")
            
            # Create temp directory
            temp_dir = tempfile.mkdtemp()
            
            # Download zip file
            response = self.session.get(url)
            response.raise_for_status()
            
            # Save to temp file
            zip_path = os.path.join(temp_dir, "bg.zip")
            with open(zip_path, 'wb') as f:
                f.write(response.content)
            
            # Extract files
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
                # Get the name of the extracted .shp file
                shp_files = [f for f in zip_ref.namelist() if f.endswith('.shp')]
                if not shp_files:
                    raise ValueError("No shapefile found in download")
                shp_file = os.path.join(temp_dir, shp_files[0])
            
            logger.info(f"Successfully downloaded and extracted TIGER/Line shapefile to {shp_file}")
            return shp_file
                
        except Exception as e:
            logger.error(f"Error downloading TIGER/Line shapefile: {str(e)}")
            return None

    def load_tiger_geometries(self, shapefile_path, state_fips="06", county_fips="037"):
        """
        Load block group geometries from TIGER/Line shapefile
        
        Args:
            shapefile_path: Path to shapefile
            state_fips: State FIPS code
            county_fips: County FIPS code
            
        Returns:
            Dict of block group IDs to WKT geometries
        """
        try:
            logger.info("Loading block group geometries from TIGER/Line shapefile...")
            
            # Read shapefile
            gdf = gpd.read_file(shapefile_path)
            
            # Ensure geometry is in WGS84 (EPSG:4326)
            if gdf.crs != "EPSG:4326":
                gdf = gdf.to_crs("EPSG:4326")
            
            logger.info(f"Loaded {len(gdf)} block groups from shapefile")
            
            # Filter for county if specified
            if county_fips:
                gdf = gdf[gdf['COUNTYFP'] == county_fips]
                logger.info(f"Filtered to {len(gdf)} block groups in county {county_fips}")
            
            # Process each block group
            geometries = {}
            for _, row in gdf.iterrows():
                # Get block group ID (GEOID = STATE + COUNTY + TRACT + BLOCK GROUP)
                geoid = row['GEOID']
                
                # Extract the block group part
                tract_bg = geoid[5:]  # Remove state and county prefix
                
                # Get geometry
                geometry = row['geometry']
                
                # Convert to MultiPolygon if necessary
                if geometry.geom_type == 'Polygon':
                    geometry = MultiPolygon([geometry])
                
                # Store WKT with SRID
                geometries[tract_bg] = f"SRID=4326;{geometry.wkt}"
            
            logger.info(f"Processed {len(geometries)} block group geometries")
            self.block_group_geometries = geometries
            return geometries
            
        except Exception as e:
            logger.error(f"Error loading TIGER/Line geometries: {str(e)}")
            return {}

    def fetch_tracts_for_county(self, state_fips="06", county_fips="037"):
        """
        Fetch all census tracts for a given county from the Census API
        
        Args:
            state_fips: State FIPS code (default: 06 for California)
            county_fips: County FIPS code (default: 037 for Los Angeles County)
            
        Returns:
            List of tract IDs
        """
        self._rate_limit()
        
        try:
            url = f"{CENSUS_DATA_URL}?get=NAME&for=tract:*&in=state:{state_fips}%20county:{county_fips}&key={CENSUS_API_KEY}"
            logger.info(f"Fetching tracts for state {state_fips}, county {county_fips}")
            logger.debug(f"API URL: {url}")
            
            response = self.session.get(url, timeout=30)
            
            if response.status_code != 200:
                logger.error(f"Error fetching tracts: {response.status_code} - {response.text}")
                return []
                
            data = response.json()
            
            # First row contains headers
            headers = data[0]
            # Extract tract IDs from remaining rows
            tract_ids = [row[headers.index('tract')] for row in data[1:]]
            
            logger.info(f"Found {len(tract_ids)} tracts for state {state_fips}, county {county_fips}")
            return tract_ids
            
        except Exception as e:
            logger.error(f"Error fetching tracts: {str(e)}")
            return []

    def fetch_city_tract_data(self, state_fips="06", county_fips="037"):
        """
        Fetch tract data for Los Angeles city by filtering county tracts that intersect with city boundaries
        
        Args:
            state_fips: State FIPS code (default: 06 for California)
            county_fips: County FIPS code (default: 037 for Los Angeles County)
            
        Returns:
            List of tract IDs in Los Angeles city
        """
        logger.info(f"Fetching tract data for Los Angeles city (state {state_fips}, county {county_fips})")
        
        try:
            # Get LA city boundaries from cities table
            city_result = self.supabase.table('cities').select('bounds').eq('id', 1).execute()
            if not city_result.data:
                logger.error("Could not find Los Angeles city boundaries")
                return []
                
            bounds = city_result.data[0]['bounds']
            sw = bounds['sw']
            ne = bounds['ne']
            
            # Create a bounding box polygon for LA city
            la_bbox = f"POLYGON(({sw['lng']} {sw['lat']}, {sw['lng']} {ne['lat']}, {ne['lng']} {ne['lat']}, {ne['lng']} {sw['lat']}, {sw['lng']} {sw['lat']}))"
            
            # First, get all tracts in the county
            tract_ids = self.fetch_tracts_for_county(state_fips, county_fips)
            if not tract_ids:
                logger.error("No tracts found for county")
                return []
            
            # Load TIGER geometries to filter by city boundary
            tiger_shapefile = self.download_tiger_shapefile(state_fips)
            if not tiger_shapefile:
                logger.error("Failed to download TIGER/Line shapefile")
                return []
                
            # Read shapefile with geopandas
            gdf = gpd.read_file(tiger_shapefile)
            
            # Ensure geometry is in WGS84 (EPSG:4326)
            if gdf.crs != "EPSG:4326":
                gdf = gdf.to_crs("EPSG:4326")
            
            # Filter for county
            gdf = gdf[gdf['COUNTYFP'] == county_fips]
            
            # Create LA city boundary polygon
            city_polygon = loads(la_bbox)
            
            # Filter tracts that intersect with LA city boundary
            gdf['intersects_city'] = gdf.geometry.intersects(city_polygon)
            city_tracts = gdf[gdf['intersects_city']]['TRACTCE'].tolist()
            
            logger.info(f"Found {len(city_tracts)} tracts that intersect with Los Angeles city")
            return city_tracts
            
        except Exception as e:
            logger.error(f"Error filtering tracts for LA city: {str(e)}")
            return []

    def fetch_block_groups_for_tract(self, tract_id, state_fips="06", county_fips="037"):
        """
        Fetch all block groups for a given tract
        
        Args:
            tract_id: Census tract ID
            state_fips: State FIPS code
            county_fips: County FIPS code
            
        Returns:
            List of block group data
        """
        self._rate_limit()
        
        try:
            # Variables:
            # B01003_001E - Total population
            # B25001_001E - Housing units
            # B01002_001E - Median age
            variables = "B01003_001E,B25001_001E,B01002_001E,NAME"
            url = f"{CENSUS_DATA_URL}?get={variables}&for=block%20group:*&in=state:{state_fips}%20county:{county_fips}%20tract:{tract_id}&key={CENSUS_API_KEY}"
            
            logger.debug(f"Fetching block groups for state {state_fips}, county {county_fips}, tract {tract_id}")
            logger.debug(f"API URL: {url}")
            
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 204 or not response.text:
                logger.warning(f"No content returned for state:{state_fips}, county:{county_fips}, tract:{tract_id}")
                return []
                
            if response.status_code != 200:
                logger.error(f"Error fetching block groups: {response.status_code} - {response.text}")
                self.failed_fetches += 1
                return []
                
            try:
                data = response.json()
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON: {e}")
                logger.error(f"Response text: {response.text}")
                self.failed_fetches += 1
                return []
                
            if len(data) < 2:
                logger.warning(f"No block groups found for tract {tract_id}")
                return []
                
            # First row contains headers
            headers = data[0]
            
            # Process each block group
            block_groups = []
            for row in data[1:]:
                try:
                    block_group_data = dict(zip(headers, row))
                    
                    # Create a unique ID using our specified state and county FIPS
                    block_group_id = f"{state_fips}{county_fips}{block_group_data['tract']}{block_group_data['block group']}"
                    
                    # Create a tract_bg ID for geometry lookup (tract + block group)
                    tract_bg = f"{block_group_data['tract']}{block_group_data['block group']}"
                    
                    # Get geometry from TIGER data if available, otherwise use placeholder
                    geometry = self.block_group_geometries.get(tract_bg)
                    if not geometry:
                        # Fallback to placeholder MultiPolygon
                        logger.warning(f"No TIGER/Line geometry found for {tract_bg}, using placeholder")
                        geometry = f"SRID=4326;MULTIPOLYGON(((-118.2437 34.0522, -118.2437 34.0622, -118.2337 34.0622, -118.2337 34.0522, -118.2437 34.0522)))"
                    
                    # Format the data for database insertion
                    formatted_data = {
                        'id': block_group_id,
                        'city_id': 1,  # Default city_id (Los Angeles)
                        'state_fips': state_fips,  # Use our specified state FIPS
                        'county_fips': county_fips,  # Use our specified county FIPS
                        'block_group_id': tract_bg,
                        'total_population': int(block_group_data.get('B01003_001E', 0) or 0),
                        'housing_units': int(block_group_data.get('B25001_001E', 0) or 0),
                        'median_age': float(block_group_data.get('B01002_001E', 0) or 0),
                        'geom': geometry,
                        'demographic_data': {
                            'total_population': int(block_group_data.get('B01003_001E', 0) or 0),
                            'housing_units': int(block_group_data.get('B25001_001E', 0) or 0),
                            'median_age': float(block_group_data.get('B01002_001E', 0) or 0),
                            'updated_at': datetime.now().isoformat(),
                            'source': 'Census ACS 2022'
                        },
                        'created_at': datetime.now().isoformat(),
                        'updated_at': datetime.now().isoformat()
                    }
                    
                    block_groups.append(formatted_data)
                
                except (ValueError, TypeError, KeyError) as e:
                    logger.warning(f"Error processing block group: {str(e)}")
                    continue
                    
            self.successful_fetches += 1
            return block_groups
            
        except Exception as e:
            logger.error(f"Error fetching block groups: {str(e)}")
            self.failed_fetches += 1
            return []

    def insert_block_groups(self, block_groups):
        """
        Insert block groups into the database
        
        Args:
            block_groups: List of block group data to insert
            
        Returns:
            Number of records inserted
        """
        if not block_groups:
            return 0
            
        try:
            # Insert in smaller batches to avoid timeouts
            insert_batch_size = 100
            inserted_count = 0
            
            for i in range(0, len(block_groups), insert_batch_size):
                batch = block_groups[i:i + insert_batch_size]
                try:
                    result = self.supabase.table('census_blocks').upsert(batch).execute()
                    inserted_count += len(result.data) if hasattr(result, 'data') else 0
                    logger.info(f"Inserted batch of {len(batch)} block groups")
                except Exception as e:
                    logger.error(f"Error inserting batch: {str(e)}")
                    
            self.total_records_added += inserted_count
            return inserted_count
            
        except Exception as e:
            logger.error(f"Error inserting block groups: {str(e)}")
            return 0

    def run(self, state_fips="06", county_fips="037", clear_existing=True):
        """
        Run the full fetch process
        
        Args:
            state_fips: State FIPS code (default: 06 for California)
            county_fips: County FIPS code (default: 037 for Los Angeles County)
            clear_existing: Whether to clear existing data first (default: True)
        """
        start_time = time.time()
        logger.info(f"Starting census block fetch for state {state_fips}, county {county_fips}")
        
        # Load TIGER/Line geometries
        tiger_shapefile = self.download_tiger_shapefile(state_fips)
        if tiger_shapefile:
            self.load_tiger_geometries(tiger_shapefile, state_fips, county_fips)
        else:
            logger.warning("Failed to download TIGER/Line shapefile. Will use placeholder geometries.")
        
        # Clear existing data if requested
        if clear_existing:
            if not self.clear_existing_data():
                logger.error("Failed to clear existing data. Exiting.")
                return
        
        # 1. Fetch all tracts for the county
        tract_ids = self.fetch_tracts_for_county(state_fips, county_fips)
        if not tract_ids:
            logger.error("No tracts found. Exiting.")
            return
            
        logger.info(f"Beginning to process {len(tract_ids)} tracts")
        
        # 2. Process each tract to get its block groups
        total_block_groups = []
        with tqdm(total=len(tract_ids), desc="Fetching block groups") as pbar:
            for tract_id in tract_ids:
                # Fetch block groups for this tract
                block_groups = self.fetch_block_groups_for_tract(tract_id, state_fips, county_fips)
                
                # Insert block groups into database
                if block_groups:
                    inserted = self.insert_block_groups(block_groups)
                    logger.info(f"Inserted {inserted} block groups for tract {tract_id}")
                
                pbar.update(1)
                # Show stats
                elapsed = time.time() - start_time
                remaining = (len(tract_ids) - pbar.n) * (elapsed / max(pbar.n, 1))
                logger.info(f"Progress: {pbar.n}/{len(tract_ids)} tracts processed. "
                           f"Estimated time remaining: {remaining/60:.1f} minutes")
        
        # Log completion
        elapsed = time.time() - start_time
        logger.info(f"Census block fetch complete.")
        logger.info(f"Processed {len(tract_ids)} tracts in {elapsed/60:.1f} minutes.")
        logger.info(f"Successfully fetched data for {self.successful_fetches} tracts.")
        logger.info(f"Failed to fetch data for {self.failed_fetches} tracts.")
        logger.info(f"Total records added to database: {self.total_records_added}")

    def run_for_city(self, state_fips="06", county_fips="037", city_id=1, clear_existing=True, test_limit=0):
        """
        Run the full fetch process for Los Angeles city
        
        Args:
            state_fips: State FIPS code (default: 06 for California)
            county_fips: County FIPS code (default: 037 for Los Angeles County)
            city_id: City ID (default: 1 for Los Angeles)
            clear_existing: Whether to clear existing data first (default: True)
            test_limit: Limit the number of tracts to process for testing (default: 0, no limit)
        """
        start_time = time.time()
        logger.info(f"Starting census block fetch for Los Angeles city (state {state_fips}, county {county_fips})")
        
        # Load TIGER/Line geometries
        tiger_shapefile = self.download_tiger_shapefile(state_fips)
        if tiger_shapefile:
            self.load_tiger_geometries(tiger_shapefile, state_fips, county_fips)
        else:
            logger.warning("Failed to download TIGER/Line shapefile. Will use placeholder geometries.")
        
        # Clear existing data for this city if requested
        if clear_existing:
            if not self.clear_city_data(city_id=city_id):
                logger.error("Failed to clear existing city data. Continuing anyway.")
        
        # 1. Fetch all tracts in Los Angeles County
        tract_ids = self.fetch_city_tract_data(state_fips, county_fips)
        if not tract_ids:
            logger.error("No tract data found. Exiting.")
            return
        
        # Limit the number of tracts for testing if specified
        if test_limit > 0 and test_limit < len(tract_ids):
            logger.info(f"Limiting to first {test_limit} tracts for testing")
            tract_ids = tract_ids[:test_limit]
            
        # 2. Process each tract to get its block groups
        total_block_groups = []
        
        with tqdm(total=len(tract_ids), desc="Fetching block groups") as pbar:
            for tract_id in tract_ids:
                # Fetch block groups for this tract
                block_groups = self.fetch_block_groups_for_tract(tract_id, state_fips, county_fips)
                
                # Process the block groups
                if block_groups:
                    # Set city_id to indicate these are for Los Angeles city
                    for bg in block_groups:
                        bg['city_id'] = city_id
                        bg['demographic_data']['source'] = 'Census ACS 2022 - Los Angeles City'
                        
                    # Insert block groups into database
                    inserted = self.insert_block_groups(block_groups)
                    logger.info(f"Inserted {inserted} block groups for tract {tract_id}")
                    total_block_groups.extend(block_groups)
                    
                pbar.update(1)
                # Show stats
                elapsed = time.time() - start_time
                remaining = (len(tract_ids) - pbar.n) * (elapsed / max(pbar.n, 1))
                logger.info(f"Progress: {pbar.n}/{len(tract_ids)} tracts processed. "
                           f"Estimated time remaining: {remaining/60:.1f} minutes")
        
        # Log completion
        elapsed = time.time() - start_time
        logger.info(f"Census block fetch complete.")
        logger.info(f"Processed {len(tract_ids)} tracts in {elapsed/60:.1f} minutes.")
        logger.info(f"Total block groups inserted: {len(total_block_groups)}")
        logger.info(f"Total records added to database: {len(total_block_groups)}")

    def clear_city_data(self, city_id=1):
        """
        Clear existing census blocks data for a specific city
        
        Args:
            city_id: City ID (default: 1 for Los Angeles)
        """
        try:
            logger.info(f"Clearing existing census blocks data for city_id {city_id}...")
            
            # Count records to be deleted
            count_query = self.supabase.table('census_blocks').select('count', count='exact').eq('city_id', city_id).execute()
            count = count_query.count if hasattr(count_query, 'count') else 0
            logger.info(f"Found {count} records to clear for city_id {city_id}")
            
            # Process in batches to avoid timeouts
            if count > 0:
                # Get all IDs for this city
                id_query = self.supabase.table('census_blocks').select('id').eq('city_id', city_id).execute()
                ids = [record.get('id') for record in id_query.data]
                
                # Delete in batches
                batch_size = 100
                deleted = 0
                
                for i in range(0, len(ids), batch_size):
                    batch_ids = ids[i:i + batch_size]
                    try:
                        result = self.supabase.table('census_blocks').delete().in_('id', batch_ids).execute()
                        deleted += len(batch_ids)
                        logger.info(f"Deleted batch of {len(batch_ids)} records. Progress: {deleted}/{len(ids)}")
                    except Exception as e:
                        logger.error(f"Error deleting batch: {e}")
                
                logger.info(f"Cleared {deleted} existing records for city_id {city_id}")
            
            return True
        except Exception as e:
            logger.error(f"Error clearing city data: {str(e)}")
            return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Fetch census blocks and demographic data')
    parser.add_argument('--state', type=str, default="06", help='State FIPS code (default: 06 for California)')
    parser.add_argument('--county', type=str, default="037", help='County FIPS code (default: 037 for Los Angeles County)')
    parser.add_argument('--city', type=str, default="1", help='City ID (default: 1 for Los Angeles)')
    parser.add_argument('--keep-existing', action='store_true', help='Keep existing data (default: false)')
    parser.add_argument('--city-only', action='store_true', help='Fetch data only for the city (default: false)')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    parser.add_argument('--test', action='store_true', help='Run in test mode with limited tracts')
    parser.add_argument('--full', action='store_true', help='Fetch all tracts even in city mode (no test limit)')
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    fetcher = CensusFetcher()
    
    if args.city_only:
        # Fetch data only for the city
        test_limit = 50 if args.test and not args.full else 0
        fetcher.run_for_city(args.state, args.county, int(args.city), not args.keep_existing, test_limit)
    else:
        # Fetch data for the entire county
        fetcher.run(args.state, args.county, not args.keep_existing) 