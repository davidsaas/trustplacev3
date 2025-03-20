import os
from census import Census
from censusgeocode import CensusGeocode
from dotenv import load_dotenv
import pandas as pd
from typing import Dict, List, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CensusHelper:
    def __init__(self):
        load_dotenv()
        self.census_api_key = os.getenv('CENSUS_API_KEY')
        if not self.census_api_key:
            raise ValueError("CENSUS_API_KEY not found in environment variables")
        
        self.c = Census(self.census_api_key)
        self.cg = CensusGeocode()
        
        # Cache for block group data
        self._block_group_cache: Dict[str, Dict] = {}
        
    def get_block_group_for_location(self, lat: float, lng: float) -> Optional[Dict]:
        """Get Census block group for a lat/lng coordinate."""
        try:
            # Create cache key
            cache_key = f"{lat:.6f},{lng:.6f}"
            
            # Check cache first
            if cache_key in self._block_group_cache:
                return self._block_group_cache[cache_key]
            
            # Query Census Geocoding API
            result = self.cg.coordinates(x=lng, y=lat)
            
            if not result or 'Census Blocks' not in result[0]:
                logger.warning(f"No block group found for coordinates: {lat}, {lng}")
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
            logger.error(f"Error getting block group for {lat}, {lng}: {str(e)}")
            return None
    
    def get_population_data(self, state_fips: str, county_fips: str, tract: str, block_group: str) -> Optional[Dict]:
        """Get population data for a Census block group."""
        try:
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
                'total_population': data['B01003_001E'] or 0,
                'housing_units': data['B25001_001E'] or 0,
                'median_age': data['B01002_001E'] or 0
            }
            
        except Exception as e:
            logger.error(f"Error getting population data: {str(e)}")
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
        
        for metric in metrics:
            try:
                pop_data = self.get_population_for_location(
                    metric['latitude'],
                    metric['longitude']
                )
                
                if pop_data:
                    # Add population context to metric
                    metric['population_data'] = pop_data
                    
                    # Calculate population-adjusted rates
                    if pop_data['total_population'] > 0:
                        incidents = int(metric['description'].split('incidents in area')[0].split(':')[-1].strip())
                        rate_per_1000 = (incidents / pop_data['total_population']) * 1000
                        metric['incidents_per_1000'] = round(rate_per_1000, 2)
                    
                enriched_metrics.append(metric)
                
            except Exception as e:
                logger.error(f"Error enriching metric {metric.get('id', 'unknown')}: {str(e)}")
                enriched_metrics.append(metric)
                
        return enriched_metrics 