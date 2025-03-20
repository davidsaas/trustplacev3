-- Insert Los Angeles data
INSERT INTO cities (id, name, country, state, bounds)
VALUES (
    1,
    'Los Angeles',
    'United States',
    'California',
    '{
        "sw": {
            "lat": 33.7037,
            "lng": -118.6682
        },
        "ne": {
            "lat": 34.3373,
            "lng": -118.1553
        }
    }'::jsonb
)
ON CONFLICT (name) DO UPDATE
SET 
    country = EXCLUDED.country,
    state = EXCLUDED.state,
    bounds = EXCLUDED.bounds; 