-- Create census_blocks table if it doesn't exist
CREATE TABLE IF NOT EXISTS census_blocks (
    id TEXT PRIMARY KEY,
    city_id BIGINT NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326),
    total_population INTEGER,
    housing_units INTEGER,
    median_age DOUBLE PRECISION,
    demographic_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT fk_census_blocks_city
        FOREIGN KEY (city_id)
        REFERENCES cities(id)
        ON DELETE CASCADE
);

-- Add block_group_id column to census_blocks table
ALTER TABLE census_blocks 
    ADD COLUMN IF NOT EXISTS block_group_id TEXT,
    ADD COLUMN IF NOT EXISTS state_fips TEXT,
    ADD COLUMN IF NOT EXISTS county_fips TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_census_blocks_block_group_id 
    ON census_blocks (block_group_id);

-- Add comment to explain the new columns
COMMENT ON COLUMN census_blocks.block_group_id IS 'Census block group identifier';
COMMENT ON COLUMN census_blocks.state_fips IS 'State FIPS code';
COMMENT ON COLUMN census_blocks.county_fips IS 'County FIPS code'; 