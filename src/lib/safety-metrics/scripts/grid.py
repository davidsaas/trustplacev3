"""
Grid system module for safety metrics.
Handles grid creation and coordinate calculations.
"""

from typing import TypedDict, List, Tuple
from math import floor, ceil, cos, pi

class Bounds(TypedDict):
    sw: dict  # {"lat": float, "lng": float}
    ne: dict  # {"lat": float, "lng": float}

class GridCoordinate(TypedDict):
    lat: float
    lng: float

def create_grid_coordinates(bounds: Bounds, grid_size_km: float = 0.5) -> List[GridCoordinate]:
    """
    Create grid coordinates for a given boundary.
    
    Args:
        bounds: Dictionary containing southwest and northeast coordinates
        grid_size_km: Size of each grid cell in kilometers (default: 0.5km)
    
    Returns:
        List of grid cell coordinates
    """
    # Convert grid size from km to degrees (approximate)
    # 1 degree of latitude = 111.32 km
    # 1 degree of longitude = 111.32 * cos(latitude) km
    grid_size_lat = grid_size_km / 111.32
    # Use the middle latitude for longitude conversion
    mid_lat = (bounds['sw']['lat'] + bounds['ne']['lat']) / 2
    grid_size_lng = grid_size_km / (111.32 * abs(cos(mid_lat * pi / 180)))

    # Calculate grid boundaries
    lat_start = floor(bounds['sw']['lat'] / grid_size_lat) * grid_size_lat
    lat_end = ceil(bounds['ne']['lat'] / grid_size_lat) * grid_size_lat
    lng_start = floor(bounds['sw']['lng'] / grid_size_lng) * grid_size_lng
    lng_end = ceil(bounds['ne']['lng'] / grid_size_lng) * grid_size_lng

    # Generate grid coordinates
    coordinates: List[GridCoordinate] = []
    lat = lat_start
    while lat < lat_end:
        lng = lng_start
        while lng < lng_end:
            coordinates.append({
                'lat': round(lat, 6),
                'lng': round(lng, 6)
            })
            lng += grid_size_lng
        lat += grid_size_lat

    return coordinates

def get_grid_cell_for_point(lat: float, lng: float, grid_size_km: float = 0.5) -> GridCoordinate:
    """
    Get the grid cell coordinates for a given point.
    
    Args:
        lat: Latitude of the point
        lng: Longitude of the point
        grid_size_km: Size of each grid cell in kilometers (default: 0.5km)
    
    Returns:
        Grid cell coordinates containing the point
    """
    grid_size_lat = grid_size_km / 111.32
    grid_size_lng = grid_size_km / (111.32 * abs(cos(lat * pi / 180)))

    cell_lat = floor(lat / grid_size_lat) * grid_size_lat
    cell_lng = floor(lng / grid_size_lng) * grid_size_lng

    return {
        'lat': round(cell_lat, 6),
        'lng': round(cell_lng, 6)
    } 