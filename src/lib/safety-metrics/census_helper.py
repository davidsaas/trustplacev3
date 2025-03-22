import os
import requests
import logging
import time
import warnings
from typing import Dict, List, Tuple, Optional
from functools import lru_cache
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

# Suppress urllib3 warnings about SSL
warnings.filterwarnings('ignore', category=Warning)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CensusHelper:
    def __init__(self):
        # Census API configuration
        self.base_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
        self.benchmark = "Public_AR_Current"
        self.vintage = "Current_Current"
        
        # Add Census Data API configuration
        self.census_data_url = "https://api.census.gov/data/2022/acs/acs5"
        self.headers = {
            'User-Agent': 'Trustplace Safety Metrics/1.0'
        }
        
        # Configure session with retries and connection pooling
        self.session = requests.Session()
        retries = Retry(
            total=5,  # Increased retries
            backoff_factor=1,  # More aggressive backoff
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))  # Increased pool size
        
        # Rate limiting settings
        self.last_api_call = 0
        self.min_delay = 0.2  # Reduced delay between calls
        self.max_workers = 10  # Increased number of workers
        
        # Cache settings
        self._block_group_cache: Dict[str, str] = {}
        self._failed_locations: set = set()
        self._population_cache: Dict[str, Dict] = {}
    
    def _rate_limit(self):
        """Implement rate limiting for API calls"""
        now = time.time()
        elapsed = now - self.last_api_call
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)
        self.last_api_call = time.time()
    
    def _extract_block_group_id(self, geographies: Dict) -> Optional[str]:
        """Extract block group ID from Census API response"""
        try:
            # The Census API returns block groups in a nested structure
            block_groups = geographies.get('Block Groups', [])
            if block_groups:
                block_group = block_groups[0]
                geoid = block_group.get('GEOID')
                if geoid:
                    return geoid
            
            # If no block group found, try to construct it from block data
            blocks = geographies.get('2020 Census Blocks', [])
            if blocks:
                block = blocks[0]
                geoid = block.get('GEOID')
                if geoid and len(geoid) >= 12:
                    # Block group is the first 12 digits of the block GEOID
                    return geoid[:12]
            
            return None
            
        except (KeyError, IndexError, AttributeError) as e:
            logger.error(f"Error extracting block group ID: {str(e)}")
            return None
    
    def _fetch_single_location(self, lat: float, lng: float) -> Tuple[str, Optional[str]]:
        """Internal method to fetch block group for a single location"""
        cache_key = f"{lat:.6f},{lng:.6f}"
        
        if cache_key in self._block_group_cache:
            return cache_key, self._block_group_cache[cache_key]
        
        if cache_key in self._failed_locations:
            return cache_key, None
        
        params = {
            'x': str(lng),
            'y': str(lat),
            'benchmark': self.benchmark,
            'vintage': self.vintage,
            'format': 'json'
        }
        
        try:
            self._rate_limit()
            response = self.session.get(self.base_url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            result = data.get('result', {})
            geographies = result.get('geographies', {})
            
            block_group_id = self._extract_block_group_id(geographies)
            
            if block_group_id:
                self._block_group_cache[cache_key] = block_group_id
                return cache_key, block_group_id
            else:
                self._failed_locations.add(cache_key)
                return cache_key, None
                
        except Exception as e:
            logger.error(f"Error fetching data for {lat}, {lng}: {str(e)}")
            self._failed_locations.add(cache_key)
            return cache_key, None
    
    def get_block_groups_batch(self, coordinates: List[Tuple[float, float]], show_progress: bool = True) -> Dict[str, Optional[str]]:
        """
        Fetch block groups for multiple coordinates in parallel
        
        Args:
            coordinates: List of (lat, lng) tuples
            show_progress: Whether to show progress bar
        
        Returns:
            Dictionary mapping coordinate strings to block group IDs
        """
        results = {}
        to_fetch = []
        
        # First check cache
        for lat, lng in coordinates:
            cache_key = f"{lat:.6f},{lng:.6f}"
            if cache_key in self._block_group_cache:
                results[cache_key] = self._block_group_cache[cache_key]
            elif cache_key not in self._failed_locations:
                to_fetch.append((lat, lng))
        
        if not to_fetch:
            return results
        
        # Create progress bar
        pbar = tqdm(total=len(to_fetch), desc="Fetching block groups", disable=not show_progress)
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            future_to_coords = {
                executor.submit(self._fetch_single_location, lat, lng): (lat, lng)
                for lat, lng in to_fetch
            }
            
            # Process completed tasks
            for future in as_completed(future_to_coords):
                try:
                    cache_key, block_group = future.result()
                    if block_group:
                        results[cache_key] = block_group
                except Exception as e:
                    coords = future_to_coords[future]
                    logger.error(f"Error in worker thread for coordinates {coords}: {str(e)}")
                finally:
                    pbar.update(1)
        
        pbar.close()
        return results
    
    @lru_cache(maxsize=1000)
    def get_block_group_for_location(self, lat: float, lng: float) -> Optional[str]:
        """Get Census block group for a lat/lng coordinate with caching and rate limiting."""
        _, result = self._fetch_single_location(lat, lng)
        return result
    
    def get_population_for_block_group(self, block_group_id: str) -> Optional[Dict]:
        """Get population data for a Census block group."""
        try:
            # Check cache first
            if block_group_id in self._population_cache:
                return self._population_cache[block_group_id]
            
            # Apply rate limiting
            self._rate_limit()
            
            # Extract FIPS codes from block group ID
            state_fips = block_group_id[:2]
            county_fips = block_group_id[2:5]
            tract = block_group_id[5:11]
            block_group = block_group_id[11:12]
            
            # Construct API URL for ACS data
            params = {
                'get': 'B01003_001E,B25001_001E,B01002_001E',  # Population, Housing Units, Median Age
                'for': f'block group:{block_group}',
                'in': f'state:{state_fips} county:{county_fips} tract:{tract}'
            }
            
            response = self.session.get(
                self.census_data_url,
                params=params,
                headers=self.headers,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            if len(data) < 2:  # First row is headers
                return None
            
            # Parse response
            headers = data[0]
            values = data[1]
            result = dict(zip(headers, values))
            
            population_data = {
                'total_population': int(result.get('B01003_001E', 0) or 0),
                'housing_units': int(result.get('B25001_001E', 0) or 0),
                'median_age': float(result.get('B01002_001E', 0) or 0)
            }
            
            # Cache the result
            self._population_cache[block_group_id] = population_data
            return population_data
            
        except Exception as e:
            logger.error(f"Error getting population data for block group {block_group_id}: {str(e)}")
            return None

    def get_population_for_location(self, lat: float, lng: float) -> Optional[Dict]:
        """Get population data for a specific lat/lng coordinate."""
        block_group_id = self.get_block_group_for_location(lat, lng)
        if not block_group_id:
            return None
        
        return self.get_population_for_block_group(block_group_id)

    def enrich_safety_metrics(self, metrics: List[Dict]) -> List[Dict]:
        """Add population data to safety metrics."""
        enriched_metrics = []
        total = len(metrics)
        
        logger.info(f"Enriching {total} metrics with Census data...")
        for i, metric in enumerate(metrics, 1):
            try:
                if i % 100 == 0:
                    logger.info(f"Processed {i}/{total} metrics...")
                
                # Get block group data first
                block_group = self.get_block_group_for_location(
                    metric['latitude'],
                    metric['longitude']
                )
                
                if block_group:
                    # Add block group data to metric
                    metric['block_group_id'] = block_group
                    
                    # Get population data
                    pop_data = self.get_population_for_block_group(block_group)
                    
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

    def _get_population_data(self, block_group_id):
        """Get population data for a block group."""
        try:
            # Check cache first
            if block_group_id in self._population_cache:
                return self._population_cache[block_group_id]
            
            # Apply rate limiting
            self._rate_limit()
            
            # Extract state and county FIPS codes from block group ID
            state_fips = block_group_id[:2]
            county_fips = block_group_id[2:5]
            
            # Query Census API for population data
            variables = [
                'B01001_001E',  # Total population
                'B25001_001E',  # Total housing units
                'B01002_001E',  # Median age
            ]
            
            # Get data from Census API
            data = self.c.get(
                ('ACS/5', 2021),
                variables,
                {'block group': '*',
                 'tract': block_group_id[5:11],
                 'county': county_fips,
                 'state': state_fips}
            )
            
            if not data:
                logger.warning(f"No population data found for block group: {block_group_id}")
                return None
            
            # Find the matching block group
            for entry in data:
                if entry['block group'] == block_group_id[11:12]:
                    population_data = {
                        'total_population': int(entry['B01001_001E']) if entry['B01001_001E'] else None,
                        'housing_units': int(entry['B25001_001E']) if entry['B25001_001E'] else None,
                        'median_age': float(entry['B01002_001E']) if entry['B01002_001E'] else None
                    }
                    
                    # Cache the result
                    self._population_cache[block_group_id] = population_data
                    return population_data
            
            logger.warning(f"Block group {block_group_id} not found in Census data")
            return None
            
        except Exception as e:
            logger.error(f"Error getting population data for block group {block_group_id}: {e}")
            return None 