"""
Configuration module for safety metrics calculation.
Loads and validates environment variables.
"""

import os
from typing import TypedDict, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class SupabaseConfig(TypedDict):
    url: str
    key: str
    service_role_key: str

class Config(TypedDict):
    supabase: SupabaseConfig
    la_crime_api: str

def load_config() -> Config:
    """
    Load and validate configuration from environment variables.
    """
    required_vars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'NEXT_PUBLIC_LA_CRIME_API'
    ]

    # Check for missing environment variables
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

    return {
        'supabase': {
            'url': os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
            'key': os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
            'service_role_key': os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        },
        'la_crime_api': os.getenv('NEXT_PUBLIC_LA_CRIME_API')
    }

# Export config instance
config = load_config() 