-- First, create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing tables if they exist
DROP TABLE IF EXISTS safety_grid CASCADE;
DROP TABLE IF EXISTS cities CASCADE;

-- Create cities table
CREATE TABLE cities (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    state VARCHAR(255),
    bounds JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add unique constraint on city name
CREATE UNIQUE INDEX cities_name_unique_idx ON cities (name);

-- Add trigger to update updated_at for cities
DROP TRIGGER IF EXISTS update_cities_updated_at ON cities;
CREATE TRIGGER update_cities_updated_at
    BEFORE UPDATE ON cities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create safety_grid table
CREATE TABLE safety_grid (
    id BIGINT PRIMARY KEY,
    city_id BIGINT NOT NULL,
    grid_lat DOUBLE PRECISION NOT NULL,
    grid_lng DOUBLE PRECISION NOT NULL,
    grid_size DOUBLE PRECISION NOT NULL,
    night_safety_score INTEGER,
    vehicle_safety_score INTEGER,
    child_safety_score INTEGER,
    transit_safety_score INTEGER,
    womens_safety_score INTEGER,
    overall_safety_score INTEGER,
    total_crimes INTEGER NOT NULL DEFAULT 0,
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT fk_safety_grid_city
        FOREIGN KEY (city_id)
        REFERENCES cities(id)
        ON DELETE CASCADE
);

-- Add spatial index for faster coordinate lookups
CREATE INDEX safety_grid_coordinates_idx ON safety_grid (grid_lat, grid_lng);

-- Add unique constraint on coordinates
CREATE UNIQUE INDEX safety_grid_coordinates_unique_idx 
ON safety_grid (city_id, grid_lat, grid_lng);

-- Add trigger to update updated_at for safety_grid
DROP TRIGGER IF EXISTS update_safety_grid_updated_at ON safety_grid;
CREATE TRIGGER update_safety_grid_updated_at
    BEFORE UPDATE ON safety_grid
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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