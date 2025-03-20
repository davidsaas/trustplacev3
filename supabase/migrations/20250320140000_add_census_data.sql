-- Add Census data columns to safety_metrics table
ALTER TABLE safety_metrics 
    ADD COLUMN total_population INTEGER,
    ADD COLUMN housing_units INTEGER,
    ADD COLUMN median_age FLOAT,
    ADD COLUMN incidents_per_1000 FLOAT;

-- Add index for faster population-based queries
CREATE INDEX idx_safety_metrics_population 
    ON safety_metrics (total_population);

-- Add comment to explain the new columns
COMMENT ON COLUMN safety_metrics.total_population IS 'Total population in the Census block group';
COMMENT ON COLUMN safety_metrics.housing_units IS 'Number of housing units in the Census block group';
COMMENT ON COLUMN safety_metrics.median_age IS 'Median age of residents in the Census block group';
COMMENT ON COLUMN safety_metrics.incidents_per_1000 IS 'Number of incidents per 1000 residents'; 