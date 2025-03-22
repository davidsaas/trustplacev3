#!/usr/bin/env python3
"""
TIGER/Line Data Helper
Handles fetching and processing Census TIGER/Line shapefiles for block group boundaries
"""

import os
import requests
import geopandas as gpd
import pandas as pd
import tempfile
import zipfile
import logging
from shapely.geometry import shape, MultiPolygon
from requests_cache import CachedSession
from datetime import timedelta
from typing import Dict, List, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TigerHelper:
    def __init__(self):
        # Configure cached session for downloads
        self.session = CachedSession(
            'tiger_cache',
            expire_after=timedelta(days=1),
            allowable_methods=['GET', 'HEAD']
        )
        
        # TIGER/Line FTP configuration
        self.tiger_base_url = "https://www2.census.gov/geo/tiger/TIGER2022"
        self.la_state_fips = "06"  # California
        self.la_county_fips = "037"  # Los Angeles County
        
    def download_shapefile(self, year: str = "2022") -> Optional[str]:
        """Download block group shapefile for Los Angeles County."""
        try:
            # Construct URL for block group shapefile
            # Format: tl_YYYY_SS_bg.zip where YYYY=year, SS=state FIPS
            url = f"{self.tiger_base_url}/BG/tl_{year}_{self.la_state_fips}_bg.zip"
            
            logger.info(f"Downloading shapefile from {url}")
            
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
            
            return shp_file
                
        except Exception as e:
            logger.error(f"Error downloading shapefile: {str(e)}")
            return None
    
    def process_shapefile(self, shapefile_path: str) -> Dict[str, Dict]:
        """Process shapefile and extract block group boundaries."""
        try:
            logger.info("Reading shapefile...")
            gdf = gpd.read_file(shapefile_path)
            
            # Ensure geometry is in WGS84 (EPSG:4326)
            if gdf.crs != "EPSG:4326":
                gdf = gdf.to_crs("EPSG:4326")
            
            # Extract GEOID and geometry
            results = {}
            for idx, row in gdf.iterrows():
                geoid = row['GEOID']
                # Log first few GEOIDs to understand format
                if idx < 5:
                    logger.info(f"Sample GEOID from shapefile: {geoid}")
                
                # Remove state and county prefix if present (12 digits -> 6 digits)
                if len(geoid) == 12:
                    geoid = geoid[5:]
                
                geometry = row['geometry']
                
                # Convert Polygon to MultiPolygon if necessary
                if geometry.geom_type == 'Polygon':
                    geometry = MultiPolygon([geometry])
                
                # Convert to WKT format for PostGIS
                wkt = geometry.wkt
                
                results[geoid] = {
                    'geom': f'SRID=4326;{wkt}'
                }
            
            return results
            
        except Exception as e:
            logger.error(f"Error processing shapefile: {str(e)}")
            return {}
    
    def update_block_boundaries(self, supabase_client, block_boundaries: Dict[str, Dict]) -> bool:
        """Insert block group boundaries into database."""
        try:
            logger.info(f"Inserting boundaries for {len(block_boundaries)} block groups...")
            
            # Prepare batch of records to insert
            records = []
            for block_id, data in block_boundaries.items():
                # Format: 06037XXXXXX where:
                # 06 = California
                # 037 = Los Angeles County
                # XXXXXX = Block Group ID
                full_geoid = f"{self.la_state_fips}{self.la_county_fips}{block_id}"
                
                records.append({
                    'id': full_geoid,
                    'geom': data['geom'],
                    'state_fips': self.la_state_fips,
                    'county_fips': self.la_county_fips,
                    'block_group_id': block_id
                })
            
            # Insert records in batches of 100
            batch_size = 100
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                try:
                    result = supabase_client.table('census_blocks').insert(batch).execute()
                    logger.info(f"Inserted batch of {len(batch)} records")
                    
                except Exception as e:
                    logger.error(f"Error inserting batch: {str(e)}")
                    continue
            
            return True
            
        except Exception as e:
            logger.error(f"Error inserting block boundaries: {str(e)}")
            return False
    
    def fetch_and_update_boundaries(self, supabase_client) -> bool:
        """Main function to fetch and update block group boundaries."""
        try:
            # Download shapefile
            shapefile_path = self.download_shapefile()
            if not shapefile_path:
                return False
            
            # Process shapefile
            block_boundaries = self.process_shapefile(shapefile_path)
            if not block_boundaries:
                return False
            
            # Update database
            return self.update_block_boundaries(supabase_client, block_boundaries)
            
        except Exception as e:
            logger.error(f"Error in fetch and update process: {str(e)}")
            return False 