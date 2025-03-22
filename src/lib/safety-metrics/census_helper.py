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
from datetime import datetime

# Suppress urllib3 warnings about SSL
warnings.filterwarnings('ignore', category=Warning)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CensusHelper:
    def __init__(self, supabase_client=None):
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
        self.session.mount("https://", HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))
        
        # Rate limiting settings
        self.last_api_call = 0
        self.min_delay = 1.0  # More conservative rate limit
        self.max_workers = 5  # Fewer concurrent workers
        
        # Cache settings
        self._block_group_cache: Dict[str, str] = {}
        self._failed_locations: set = set()
        self._population_cache: Dict[str, Dict] = {}
        
        # Store Supabase client
        self.supabase = supabase_client
    
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
            
            # Structure data to match our schema
            demographic_data = {
                'total_population': int(result.get('B01003_001E', 0) or 0),
                'housing_units': int(result.get('B25001_001E', 0) or 0),
                'median_age': float(result.get('B01002_001E', 0) or 0),
                'updated_at': datetime.now().isoformat()
            }
            
            # Cache the result
            self._population_cache[block_group_id] = demographic_data
            return demographic_data
            
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
                            'total_population': pop_data['total_population'],
                            'housing_units': pop_data['housing_units'],
                            'median_age': pop_data['median_age']
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

    def _get_population_data_batch(self, block_group_ids: List[str]) -> Dict[str, Dict]:
        """Fetch population data for multiple block groups in one request."""
        if not block_group_ids:
            return {}
            
        # Group by state and county to minimize API calls
        groups = {}
        for bg_id in block_group_ids:
            state_fips = bg_id[:2]
            county_fips = bg_id[2:5]
            tract = bg_id[5:11]
            block_group = bg_id[11:]
            key = (state_fips, county_fips)
            if key not in groups:
                groups[key] = set()
            groups[key].add((tract, block_group))
            
        results = {}
        for (state_fips, county_fips), tracts in groups.items():
            # Build IN clause for tracts
            tract_list = list(set(t[0] for t in tracts))
            if not tract_list:
                continue
                
            try:
                # Sleep for rate limiting
                elapsed = time.time() - self.last_api_call
                if elapsed < self.min_delay:
                    time.sleep(self.min_delay - elapsed)
                
                params = {
                    'get': 'B01003_001E,B25001_001E,B01002_001E',
                    'for': 'block group:*',
                    'in': f'state:{state_fips} county:{county_fips} tract:{"&tract:".join(tract_list)}'
                }
                
                response = self.session.get(
                    self.census_data_url,
                    params=params,
                    headers=self.headers,
                    timeout=30
                )
                self.last_api_call = time.time()
                response.raise_for_status()
                
                data = response.json()
                if len(data) < 2:
                    continue
                    
                # Parse response
                headers = data[0]
                for row in data[1:]:
                    result = dict(zip(headers, row))
                    bg_id = f"{result['state']}{result['county']}{result['tract']}{result['block group']}"
                    if bg_id in block_group_ids:
                        results[bg_id] = {
                            'total_population': int(result['B01003_001E'] or 0),
                            'housing_units': int(result['B25001_001E'] or 0),
                            'median_age': float(result['B01002_001E'] or 0)
                        }
                        self._population_cache[bg_id] = results[bg_id]
                        
            except Exception as e:
                logger.error(f"Error fetching batch population data: {str(e)}")
                continue
                
        return results
        
    def _get_population_data(self, block_group_id: str) -> Optional[Dict]:
        """Get population data for a single block group, using batch processing if not cached."""
        # Check cache first
        if block_group_id in self._population_cache:
            return self._population_cache[block_group_id]
            
        # Fetch in a batch of one
        results = self._get_population_data_batch([block_group_id])
        return results.get(block_group_id)

    async def ensure_census_block_exists(self, block_group_id: str, city_id: int, lat: float, lon: float) -> bool:
        """Ensure census block exists in database, create or update if necessary."""
        try:
            if not self.supabase:
                logger.error("Supabase client not provided")
                return False

            # Get demographic data
            demographic_data = self._get_population_data(block_group_id)
            if not demographic_data:
                return False

            # Prepare census block data
            census_block = {
                'id': block_group_id,
                'city_id': city_id,
                'geom': f'SRID=4326;MULTIPOLYGON((({lon-0.001} {lat-0.001}, {lon+0.001} {lat-0.001}, {lon+0.001} {lat+0.001}, {lon-0.001} {lat+0.001}, {lon-0.001} {lat-0.001})))',
                'total_population': demographic_data['total_population'],
                'housing_units': demographic_data['housing_units'],
                'median_age': demographic_data['median_age'],
                'demographic_data': demographic_data,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }

            # Upsert the census block
            result = self.supabase.table('census_blocks').upsert(census_block).execute()
            return bool(result.data)

        except Exception as e:
            logger.error(f"Error ensuring census block exists: {str(e)}")
            return False 