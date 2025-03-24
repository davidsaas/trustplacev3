-- Function to find a census block containing a given point
CREATE OR REPLACE FUNCTION find_containing_block(point_geom text)
RETURNS TABLE (
  id uuid,
  block_group_id text,
  total_population integer,
  housing_units integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cb.id,
    cb.block_group_id,
    cb.total_population,
    cb.housing_units
  FROM 
    census_blocks cb
  WHERE 
    ST_Contains(cb.geom, ST_GeomFromText(point_geom, 4326))
  LIMIT 1;
END;
$$;

-- Grant usage to authenticated users
GRANT EXECUTE ON FUNCTION find_containing_block(text) TO authenticated;
GRANT EXECUTE ON FUNCTION find_containing_block(text) TO anon;
GRANT EXECUTE ON FUNCTION find_containing_block(text) TO service_role; 