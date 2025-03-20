"""
Database operations module for safety metrics.
Handles all Supabase interactions.
"""

from typing import TypedDict, List, Optional
from supabase import create_client, Client
from scripts.config import config

class GridCell(TypedDict):
    id: int
    city_id: int
    grid_lat: float
    grid_lng: float
    grid_size: float
    night_safety_score: Optional[int]
    vehicle_safety_score: Optional[int]
    child_safety_score: Optional[int]
    transit_safety_score: Optional[int]
    womens_safety_score: Optional[int]
    overall_safety_score: Optional[int]
    total_crimes: int
    confidence_score: float

class Database:
    def __init__(self):
        self.client: Client = create_client(
            config['supabase']['url'],
            config['supabase']['service_role_key']
        )

    def get_city_by_name(self, name: str) -> Optional[dict]:
        """
        Get city information by name.
        """
        response = self.client.table('cities').select('*').eq('name', name).execute()
        return response.data[0] if response.data else None

    def batch_upsert_grid_cells(self, cells: List[GridCell]) -> None:
        """
        Upsert multiple grid cells in a batch operation.
        """
        if not cells:
            return

        # Upsert in batches of 100
        batch_size = 100
        for i in range(0, len(cells), batch_size):
            batch = cells[i:i + batch_size]
            self.client.table('safety_grid').upsert(batch).execute()

    def get_grid_cell(self, lat: float, lng: float, city_id: int) -> Optional[GridCell]:
        """
        Get a specific grid cell by coordinates and city.
        """
        response = self.client.table('safety_grid')\
            .select('*')\
            .eq('city_id', city_id)\
            .eq('grid_lat', lat)\
            .eq('grid_lng', lng)\
            .execute()
        
        return response.data[0] if response.data else None

# Export database instance
db = Database() 