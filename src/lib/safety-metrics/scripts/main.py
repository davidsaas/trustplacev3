"""
Main script for safety metrics calculation.
Orchestrates the entire process of fetching data and updating safety metrics.
"""

from typing import Dict, List
from scripts.config import config
from scripts.database import db
from scripts.fetch import fetcher
from scripts.grid import create_grid_coordinates, get_grid_cell_for_point
from scripts.metrics import calculate_safety_scores, calculate_confidence_score

def process_city(city_name: str = "Los Angeles") -> None:
    """
    Process safety metrics for a city.
    
    Args:
        city_name: Name of the city to process
    """
    # Get city information
    city = db.get_city_by_name(city_name)
    if not city:
        raise ValueError(f"City {city_name} not found in database")

    print(f"Processing safety metrics for {city_name}")
    
    # Create grid for city
    print("Creating grid coordinates...")
    grid_coordinates = create_grid_coordinates(city['bounds'])
    print(f"Created {len(grid_coordinates)} grid cells")
    
    # Fetch recent crime data
    print("Fetching crime data...")
    crimes = fetcher.fetch_recent_crimes(days=30)
    print(f"Fetched {len(crimes)} crimes")
    
    # Process each crime and assign to grid cells
    print("Processing crimes and calculating safety scores...")
    grid_crimes: Dict[str, List] = {}
    
    for crime in crimes:
        try:
            lat = float(crime['lat'])
            lng = float(crime['lon'])
            cell = get_grid_cell_for_point(lat, lng)
            cell_key = f"{cell['lat']},{cell['lng']}"
            
            if cell_key not in grid_crimes:
                grid_crimes[cell_key] = []
            grid_crimes[cell_key].append(crime)
        except (KeyError, ValueError):
            continue
    
    # Calculate safety scores for each grid cell
    print("Updating grid cells in database...")
    batch = []
    next_id = 1
    
    for coords in grid_coordinates:
        cell_key = f"{coords['lat']},{coords['lng']}"
        cell_crimes = grid_crimes.get(cell_key, [])
        
        # Calculate scores
        safety_scores = calculate_safety_scores(cell_crimes)
        confidence = calculate_confidence_score(len(cell_crimes))
        
        # Prepare grid cell record
        cell = {
            'id': next_id,
            'city_id': city['id'],
            'grid_lat': coords['lat'],
            'grid_lng': coords['lng'],
            'grid_size': 0.5,
            'total_crimes': len(cell_crimes),
            'confidence_score': confidence,
            **safety_scores
        }
        
        batch.append(cell)
        next_id += 1
        
        # Update database in batches
        if len(batch) >= 100:
            db.batch_upsert_grid_cells(batch)
            batch = []
    
    # Insert remaining cells
    if batch:
        db.batch_upsert_grid_cells(batch)
    
    print("Safety metrics processing completed!")

if __name__ == "__main__":
    process_city() 