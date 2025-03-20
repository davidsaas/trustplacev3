"""
Data fetching module for LA crime data.
Handles pagination and rate limiting for the LA crime API.
"""

import requests
from typing import List, Dict, Any
from datetime import datetime, timedelta
from time import sleep
from scripts.config import config

class CrimeFetcher:
    def __init__(self):
        self.api_url = config['la_crime_api']
        self.batch_size = 1000
        self.rate_limit_delay = 1  # seconds between requests

    def fetch_recent_crimes(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Fetch crimes from the last N days.
        Uses pagination to handle large datasets.
        
        Args:
            days: Number of days of data to fetch (default: 30)
        
        Returns:
            List of crime records
        """
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        all_crimes = []
        offset = 0
        
        while True:
            # Build query with pagination and date filter
            params = {
                '$limit': self.batch_size,
                '$offset': offset,
                '$where': f"date_occ >= '{start_date}'"
            }
            
            try:
                response = requests.get(self.api_url, params=params)
                response.raise_for_status()
                
                batch = response.json()
                if not batch:
                    break
                    
                all_crimes.extend(batch)
                offset += len(batch)
                
                # Respect rate limiting
                sleep(self.rate_limit_delay)
                
            except requests.exceptions.RequestException as e:
                print(f"Error fetching crimes: {e}")
                # On error, return what we have so far
                break
        
        return all_crimes

# Export fetcher instance
fetcher = CrimeFetcher() 