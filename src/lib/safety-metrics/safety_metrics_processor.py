import os
import json
import requests
import pandas as pd
from datetime import datetime
from supabase import create_client, Client
from typing import Dict, List, Tuple
import numpy as np
from dotenv import load_dotenv
import time
from tqdm import tqdm

# Load environment variables
load_dotenv()
print("✅ Environment variables loaded")

# Initialize Supabase client
try:
    supabase: Client = create_client(
        os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
        os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    )
    print("✅ Connected to Supabase")
except Exception as e:
    print("❌ Failed to connect to Supabase:", e)
    exit(1)

# Constants
GRID_CELL_SIZE = 500  # meters
LA_BOUNDS = {
    "ne": {"lat": 34.3373, "lng": -118.1553},
    "sw": {"lat": 33.7037, "lng": -118.6682}
}
print(f"📍 Grid cell size: {GRID_CELL_SIZE}m")
print(f"📍 LA Bounds: NE({LA_BOUNDS['ne']['lat']}, {LA_BOUNDS['ne']['lng']}) SW({LA_BOUNDS['sw']['lat']}, {LA_BOUNDS['sw']['lng']})")

def fetch_la_crime_data(offset: int = 0, limit: int = 1000) -> List[Dict]:
    """Fetch crime data from LA API with pagination"""
    url = f"{os.getenv('NEXT_PUBLIC_LA_CRIME_API')}?$limit={limit}&$offset={offset}"
    try:
        print(f"🔍 Fetching crime data (limit: {limit}, offset: {offset})...")
        response = requests.get(url)
        response.raise_for_status()  # Raise exception for bad status codes
        data = response.json()
        print(f"✅ Successfully fetched {len(data)} records")
        return data
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to fetch crime data: {e}")
        return []

def create_grid_points() -> List[Tuple[float, float]]:
    """Create grid points covering LA area"""
    print("📊 Creating grid points...")
    lat_range = np.arange(LA_BOUNDS['sw']['lat'], LA_BOUNDS['ne']['lat'], 0.005)
    lng_range = np.arange(LA_BOUNDS['sw']['lng'], LA_BOUNDS['ne']['lng'], 0.005)
    points = [(lat, lng) for lat in lat_range for lng in lng_range]
    print(f"✅ Created {len(points)} grid points")
    return points

def calculate_basic_safety_metrics(crimes: List[Dict], lat: float, lng: float) -> Dict:
    """Calculate basic safety metrics for a given location"""
    # Convert crimes to DataFrame for easier processing
    df = pd.DataFrame(crimes)
    
    metrics = {
        'night_safety_score': 0.0,
        'vehicle_safety_score': 0.0,
        'child_safety_score': 0.0,
        'transit_safety_score': 0.0,
        'womens_safety_score': 0.0,
        'total_incidents': len(crimes)
    }
    
    if not df.empty:
        try:
            # Night safety (crimes between 6PM and 6AM)
            df['time_occ'] = pd.to_numeric(df['time_occ'])
            night_crimes = df[
                (df['time_occ'] >= 1800) | 
                (df['time_occ'] <= 600)
            ]
            metrics['night_safety_score'] = max(0, 100 - (len(night_crimes) * 2))

            # Vehicle safety (vehicle-related crimes)
            vehicle_crimes = df[
                df['crm_cd_desc'].str.contains('VEHICLE|AUTO|CAR', 
                case=False, na=False)
            ]
            metrics['vehicle_safety_score'] = max(0, 100 - (len(vehicle_crimes) * 2))

            # Basic scores for other metrics
            metrics['child_safety_score'] = max(0, 100 - (len(df) * 1.5))
            metrics['transit_safety_score'] = max(0, 100 - (len(df) * 1.5))
            metrics['womens_safety_score'] = max(0, 100 - (len(df) * 1.5))
        except Exception as e:
            print(f"⚠️ Warning: Error calculating metrics for point ({lat}, {lng}): {e}")

    return metrics

def process_and_store_metrics():
    """Main function to process crime data and store metrics"""
    print("\n🚀 Starting safety metrics processing...")
    start_time = time.time()
    
    # Fetch initial batch of crime data
    crimes = fetch_la_crime_data(limit=50000)
    if not crimes:
        print("❌ No crime data available. Exiting.")
        return
    
    # Create grid points
    grid_points = create_grid_points()
    
    # Process each grid point with progress bar
    print("\n💫 Processing grid points and storing metrics...")
    success_count = 0
    error_count = 0
    
    for lat, lng in tqdm(grid_points, desc="Processing grid points", unit="point"):
        metrics = calculate_basic_safety_metrics(crimes, lat, lng)
        
        # Store in Supabase
        data = {
            'location': f'POINT({lng} {lat})',
            'cell_size': GRID_CELL_SIZE,
            **metrics
        }
        
        try:
            supabase.table('safety_grid').insert(data).execute()
            success_count += 1
        except Exception as e:
            print(f"\n❌ Error storing metrics for point ({lat}, {lng}): {e}")
            error_count += 1

    # Final statistics
    end_time = time.time()
    duration = end_time - start_time
    print("\n📊 Processing Statistics:")
    print(f"✅ Successfully processed points: {success_count}")
    print(f"❌ Failed points: {error_count}")
    print(f"⏱️ Total processing time: {duration:.2f} seconds")
    print(f"📈 Success rate: {(success_count / len(grid_points)) * 100:.2f}%")
    print("\n✨ Safety metrics processing completed!")

if __name__ == "__main__":
    process_and_store_metrics() 