-- Update existing census blocks to have city_id = 1 (Los Angeles)
UPDATE census_blocks
SET city_id = 1
WHERE city_id IS NULL;

-- Add NOT NULL constraint to city_id
ALTER TABLE census_blocks
ALTER COLUMN city_id SET NOT NULL; 