"""
Test script to verify setup and connections.
"""

import sys
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

from scripts.config import config
from scripts.database import db
from scripts.fetch import fetcher

def test_setup():
    """
    Test all components of the safety metrics system.
    """
    print("Testing Safety Metrics Setup")
    print("-" * 50)

    # 1. Test config
    print("\n1. Testing configuration...")
    try:
        print(f"✓ Supabase URL configured: {config['supabase']['url'][:30]}...")
        print(f"✓ LA Crime API configured: {config['la_crime_api']}")
    except Exception as e:
        print(f"✗ Configuration error: {e}")
        return

    # 2. Test database connection
    print("\n2. Testing database connection...")
    try:
        city = db.get_city_by_name("Los Angeles")
        if city:
            print("✓ Successfully connected to Supabase")
            print(f"✓ Found LA city record: {city['name']}")
        else:
            print("✗ Could not find Los Angeles in cities table")
    except Exception as e:
        print(f"✗ Database error: {e}")
        return

    # 3. Test LA API connection
    print("\n3. Testing LA Crime API connection...")
    try:
        crimes = fetcher.fetch_recent_crimes(days=1)  # Just fetch 1 day for testing
        print(f"✓ Successfully fetched {len(crimes)} crimes from the last 24 hours")
        if crimes:
            print(f"✓ Sample crime data: {list(crimes[0].keys())}")
    except Exception as e:
        print(f"✗ API error: {e}")
        return

    print("\nSetup test completed successfully!")

if __name__ == "__main__":
    test_setup() 