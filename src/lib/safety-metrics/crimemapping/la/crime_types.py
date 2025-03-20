"""
LA-specific crime type mappings.
Maps LA crime codes to our safety metric categories.
"""

from typing import TypedDict, List, Dict

class CrimeMapping(TypedDict):
    night_safety: float
    vehicle_safety: float
    child_safety: float
    transit_safety: float
    womens_safety: float
    severity: float  # Base severity weight for the crime type

# Crime code mappings for LA
# Weights are on a scale of 0-1, will be adjusted by severity
CRIME_MAPPINGS: Dict[str, CrimeMapping] = {
    # Violent crimes
    '110': {  # Criminal Homicide
        'night_safety': 1.0,
        'vehicle_safety': 0.0,
        'child_safety': 1.0,
        'transit_safety': 0.5,
        'womens_safety': 1.0,
        'severity': 1.0
    },
    '121': {  # Rape
        'night_safety': 1.0,
        'vehicle_safety': 0.0,
        'child_safety': 1.0,
        'transit_safety': 0.5,
        'womens_safety': 1.0,
        'severity': 1.0
    },
    '122': {  # Attempted Rape
        'night_safety': 1.0,
        'vehicle_safety': 0.0,
        'child_safety': 1.0,
        'transit_safety': 0.5,
        'womens_safety': 1.0,
        'severity': 0.8
    },
    '210': {  # Robbery
        'night_safety': 1.0,
        'vehicle_safety': 0.5,
        'child_safety': 0.7,
        'transit_safety': 1.0,
        'womens_safety': 0.8,
        'severity': 0.8
    },
    # Vehicle-related crimes
    '510': {  # Vehicle - Stolen
        'night_safety': 0.3,
        'vehicle_safety': 1.0,
        'child_safety': 0.0,
        'transit_safety': 0.0,
        'womens_safety': 0.0,
        'severity': 0.6
    },
    '520': {  # Vehicle - Burglary
        'night_safety': 0.3,
        'vehicle_safety': 1.0,
        'child_safety': 0.0,
        'transit_safety': 0.0,
        'womens_safety': 0.0,
        'severity': 0.5
    }
    # Add more crime codes as needed
}

def get_crime_mapping(crime_code: str) -> CrimeMapping:
    """
    Get the safety metric mappings for a given crime code.
    Returns default mapping if code not found.
    """
    default_mapping: CrimeMapping = {
        'night_safety': 0.2,
        'vehicle_safety': 0.2,
        'child_safety': 0.2,
        'transit_safety': 0.2,
        'womens_safety': 0.2,
        'severity': 0.3
    }
    
    return CRIME_MAPPINGS.get(crime_code, default_mapping) 