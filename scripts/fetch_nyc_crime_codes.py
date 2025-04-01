import requests
import json
from typing import Dict, Set, Tuple

# --- Configuration ---
API_ENDPOINT: str = "https://data.cityofnewyork.us/resource/uip8-fykc.json"
# Request more records than the default (adjust as needed, check API limits)
RECORD_LIMIT: int = 20000 
# Optional: Add your NYC Open Data App Token if you have one (can increase rate limits)
# APP_TOKEN: str | None = None # Or load from os.getenv("NYC_APP_TOKEN")
APP_TOKEN: str | None = None 
# --- ---

def fetch_unique_crime_codes(url: str, limit: int, token: str | None) -> Dict[str, str]:
    """Fetches data from the API and extracts unique KY_CD:OFNS_DESC pairs."""
    params = {"$limit": limit}
    headers = {}
    if token:
        headers["X-App-Token"] = token

    print(f"Fetching up to {limit} records from {url}...")
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=60) # Added timeout
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        
        print("Data fetched successfully. Processing...")
        data = response.json()
        
        unique_codes: Dict[str, str] = {}
        seen_pairs: Set[Tuple[str, str]] = set()

        for record in data:
            ky_cd = record.get("ky_cd")
            ofns_desc = record.get("ofns_desc")

            if ky_cd and ofns_desc:
                pair = (ky_cd, ofns_desc)
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    # Store the description, overwriting if KY_CD seen before (should be consistent)
                    unique_codes[ky_cd] = ofns_desc
                    
        # Sort by KY_CD for readability
        sorted_codes = dict(sorted(unique_codes.items()))
        return sorted_codes

    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return {}
    except json.JSONDecodeError:
        print("Error decoding JSON response.")
        return {}
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return {}


if __name__ == "__main__":
    unique_crime_codes = fetch_unique_crime_codes(API_ENDPOINT, RECORD_LIMIT, APP_TOKEN)

    if unique_crime_codes:
        print("\n--- Unique Crime Codes (KY_CD: OFNS_DESC) ---")
        for code, desc in unique_crime_codes.items():
            print(f"{code}: {desc}")
        print(f"\nFound {len(unique_crime_codes)} unique KY_CD codes in the {RECORD_LIMIT} records checked.")
    else:
        print("\nNo unique crime codes found or an error occurred.") 