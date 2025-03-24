-- Create function to get census blocks within a radius
CREATE OR REPLACE FUNCTION get_census_blocks_in_radius(
  center_point text,
  radius_degrees float
)
RETURNS TABLE (
  id text,
  geom text,
  total_population int,
  housing_units int,
  demographic_data jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cb.id,
    ST_AsGeoJSON(cb.geom)::text as geom,
    cb.total_population,
    cb.housing_units,
    cb.demographic_data
  FROM census_blocks cb
  WHERE ST_DWithin(
    cb.geom::geometry,
    ST_GeomFromText(center_point, 4326)::geometry,
    radius_degrees
  );
END;
$$; 