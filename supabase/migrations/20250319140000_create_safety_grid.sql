-- Create safety_grid table
CREATE TABLE IF NOT EXISTS safety_grid (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add spatial index for faster coordinate lookups
CREATE INDEX IF NOT EXISTS safety_grid_coordinates_idx ON safety_grid (grid_lat, grid_lng);

-- Add city foreign key
ALTER TABLE safety_grid
    ADD CONSTRAINT fk_safety_grid_city
    FOREIGN KEY (city_id)
    REFERENCES cities(id)
    ON DELETE CASCADE;

-- Add unique constraint on coordinates
ALTER TABLE safety_grid
    ADD CONSTRAINT safety_grid_coordinates_unique
    UNIQUE (city_id, grid_lat, grid_lng);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_safety_grid_updated_at
    BEFORE UPDATE ON safety_grid
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 