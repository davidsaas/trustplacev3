"""
Safety metrics calculation module.
Handles the computation of safety scores from crime data.
"""

from typing import Dict, List, Any
from datetime import datetime
from math import exp
from crimemapping.la.crime_types import get_crime_mapping

def calculate_time_weight(crime_time: str) -> float:
    """
    Calculate time-based weight for a crime.
    Night crimes (18:00-06:00) are weighted more heavily for night safety.
    """
    try:
        hour = int(datetime.strptime(crime_time, '%H:%M:%S').strftime('%H'))
        is_night = hour >= 18 or hour < 6
        return 1.5 if is_night else 1.0
    except ValueError:
        return 1.0

def calculate_safety_scores(crimes: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Calculate safety scores from a list of crimes.
    
    Args:
        crimes: List of crime records from LA API
    
    Returns:
        Dictionary of safety scores (0-100)
    """
    # Initialize score accumulators
    raw_scores = {
        'night_safety': 0.0,
        'vehicle_safety': 0.0,
        'child_safety': 0.0,
        'transit_safety': 0.0,
        'womens_safety': 0.0
    }
    
    # Process each crime
    for crime in crimes:
        crime_code = crime.get('crime_code', '')
        mapping = get_crime_mapping(crime_code)
        time_weight = calculate_time_weight(crime.get('time_occ', '00:00:00'))
        
        # Update each safety metric
        for metric in raw_scores.keys():
            raw_scores[metric] += mapping[metric] * mapping['severity'] * time_weight
    
    # Convert raw scores to 0-100 scale using sigmoid function
    normalized_scores = {}
    for metric, raw_score in raw_scores.items():
        # Adjust these parameters based on data distribution
        k = -0.1  # Steepness
        x0 = 20   # Midpoint
        score = 100 / (1 + exp(k * (raw_score - x0)))
        normalized_scores[metric] = round(score)
    
    # Calculate overall safety score (weighted average)
    normalized_scores['overall_safety_score'] = round(sum(normalized_scores.values()) / len(normalized_scores))
    
    return normalized_scores

def calculate_confidence_score(crime_count: int) -> float:
    """
    Calculate confidence score based on amount of data.
    
    Args:
        crime_count: Number of crimes in the grid cell
    
    Returns:
        Confidence score between 0 and 1
    """
    # Adjust these thresholds based on data distribution
    min_crimes = 5    # Minimum crimes for baseline confidence
    max_crimes = 50   # Crimes needed for maximum confidence
    
    if crime_count < min_crimes:
        return 0.5  # Base confidence for low data areas
    elif crime_count > max_crimes:
        return 1.0  # Maximum confidence
    else:
        # Linear scaling between min and max
        return 0.5 + 0.5 * (crime_count - min_crimes) / (max_crimes - min_crimes) 