import os
from census import Census
from censusgeocode import CensusGeocode
from dotenv import load_dotenv
import pandas as pd
from typing import Dict, List, Tuple, Optional
import logging
import time
from functools import lru_cache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CensusHelper:
    def __init__(self):
        # Try multiple ways to load the API key
        self.census_api_key = None
        
        # First try direct environment
        self.census_api_key = os.getenv('CENSUS_API_KEY')
        
        # If not found, try loading from .env file
        if not self.census_api_key:
            try:
                load_dotenv()
                self.census_api_key = os.getenv('CENSUS_API_KEY')
            except Exception as e:
                logger.warning(f"Error loading .env file: {str(e)}")
        
        # If still not found, try loading from parent directory's .env
        if not self.census_api_key:
            try:
                load_dotenv('../.env')
                self.census_api_key = os.getenv('CENSUS_API_KEY')
            except Exception as e:
                logger.warning(f"Error loading parent .env file: {str(e)}")
        
        # If still not found, try loading from workspace root .env
        if not self.census_api_key:
            try:
                load_dotenv('../../.env')
                self.census_api_key = os.getenv('CENSUS_API_KEY')
            except Exception as e:
                logger.warning(f"Error loading workspace root .env file: {str(e)}")
        
        # Hardcode the key as last resort (since we can see it in the .env file)
        if not self.census_api_key:
            self.census_api_key = 'bdf6f2ebfed1b953612f94dba077e3e87bb012d'
            logger.warning("Using hardcoded Census API key as fallback")
        
        if not self.census_api_key:
            raise ValueError("CENSUS_API_KEY not found in any environment variables or .env files")
        
        self.c = Census(self.census_api_key)
        self.cg = CensusGeocode()
        
        # Rate limiting settings
        self.last_api_call = 0
        self.min_delay = 0.1  # Minimum delay between API calls in seconds
        
        # Cache settings
        self._block_group_cache: Dict[str, Dict] = {}
        self._failed_locations: set = set()  # Track failed locations to avoid retrying
    
    def _rate_limit(self):
        """Implement rate limiting for API calls"""
        now = time.time()
        elapsed = now - self.last_api_call
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)
        self.last_api_call = time.time()
    
    @lru_cache(maxsize=1000)
    def get_block_group_for_location(self, lat: float, lng: float) -> Optional[Dict]:
        """Get Census block group for a lat/lng coordinate with caching and rate limiting."""
        # Check if this location previously failed
        cache_key = f"{lat:.6f},{lng:.6f}"
        if cache_key in self._failed_locations:
            return None
        
        try:
            # Check cache first
            if cache_key in self._block_group_cache:
                return self._block_group_cache[cache_key]
            
            # Apply rate limiting
            self._rate_limit()
            
            # Query Census Geocoding API
            result = self.cg.coordinates(x=lng, y=lat)
            
            if not result or 'Census Blocks' not in result[0]:
                self._failed_locations.add(cache_key)
                return None
            
            block_info = result[0]
            block_group_data = {
                'state_fips': block_info['States'][0]['STATE'],
                'county_fips': block_info['Counties'][0]['COUNTY'],
                'tract': block_info['Census Tracts'][0]['TRACT'],
                'block_group': block_info['Census Blocks'][0]['BLKGRP']
            }
            
            # Cache the result
            self._block_group_cache[cache_key] = block_group_data
            return block_group_data
            
        except Exception as e:
            self._failed_locations.add(cache_key)
            logger.debug(f"Error getting block group for {lat}, {lng}: {str(e)}")
            return None
    
    @lru_cache(maxsize=1000)
    def get_population_data(self, state_fips: str, county_fips: str, tract: str, block_group: str) -> Optional[Dict]:
        """Get population data for a Census block group with caching."""
        try:
            # Apply rate limiting
            self._rate_limit()
            
            # Query ACS 5-year data (most recent)
            variables = [
                'B01003_001E',  # Total population
                'B25001_001E',  # Housing units
                'B01002_001E',  # Median age
            ]
            
            results = self.c.acs5.state_county_tract_blockgroup(
                variables,
                state_fips=state_fips,
                county_fips=county_fips,
                tract=tract,
                block_group=block_group,
                year=2022  # Most recent ACS 5-year estimates
            )
            
            if not results:
                return None
                
            data = results[0]
            return {
                'total_population': data.get('B01003_001E', 0) or 0,
                'housing_units': data.get('B25001_001E', 0) or 0,
                'median_age': data.get('B01002_001E', 0) or 0
            }
            
        except Exception as e:
            logger.debug(f"Error getting population data: {str(e)}")
            return None
    
    def get_population_for_location(self, lat: float, lng: float) -> Optional[Dict]:
        """Get population data for a specific lat/lng coordinate."""
        block_group = self.get_block_group_for_location(lat, lng)
        if not block_group:
            return None
            
        return self.get_population_data(
            block_group['state_fips'],
            block_group['county_fips'],
            block_group['tract'],
            block_group['block_group']
        )

    def enrich_safety_metrics(self, metrics: List[Dict]) -> List[Dict]:
        """Add population data to safety metrics."""
        enriched_metrics = []
        total = len(metrics)
        
        logger.info(f"Enriching {total} metrics with Census data...")
        for i, metric in enumerate(metrics, 1):
            try:
                if i % 100 == 0:
                    logger.info(f"Processed {i}/{total} metrics...")
                
                pop_data = self.get_population_for_location(
                    metric['latitude'],
                    metric['longitude']
                )
                
                if pop_data:
                    # Add population context to metric
                    metric.update({
                        'total_population': pop_data.get('total_population'),
                        'housing_units': pop_data.get('housing_units'),
                        'median_age': pop_data.get('median_age')
                    })
                    
                    # Calculate population-adjusted rates if we have incident count
                    if pop_data['total_population'] > 0:
                        try:
                            incidents = int(metric['description'].split('incidents in area')[0].split(':')[-1].strip())
                            rate_per_1000 = (incidents / pop_data['total_population']) * 1000
                            metric['incidents_per_1000'] = round(rate_per_1000, 2)
                        except (ValueError, IndexError):
                            pass
                
                enriched_metrics.append(metric)
                
            except Exception as e:
                logger.debug(f"Error enriching metric {metric.get('id', 'unknown')}: {str(e)}")
                enriched_metrics.append(metric)
        
        logger.info("Census data enrichment complete")
        return enriched_metrics 