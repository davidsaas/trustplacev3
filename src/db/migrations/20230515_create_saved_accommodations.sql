-- Create saved accommodations table
CREATE TABLE IF NOT EXISTS saved_accommodations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  accommodation_id TEXT NOT NULL, -- References accommodations.id
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  url TEXT,
  
  -- Ensure a user can't save the same accommodation twice
  UNIQUE (user_id, accommodation_id)
);

-- Create comment explaining the accommodation_id field
COMMENT ON COLUMN saved_accommodations.accommodation_id IS 'References the ID in the accommodations table';

-- Create indexes
CREATE INDEX IF NOT EXISTS saved_accommodations_user_id_idx ON saved_accommodations(user_id);
CREATE INDEX IF NOT EXISTS saved_accommodations_accommodation_id_idx ON saved_accommodations(accommodation_id);

-- Add RLS policies
ALTER TABLE saved_accommodations ENABLE ROW LEVEL SECURITY;

-- Policy for selecting saved accommodations
CREATE POLICY select_saved_accommodations ON saved_accommodations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for inserting saved accommodations
CREATE POLICY insert_saved_accommodations ON saved_accommodations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for deleting saved accommodations
CREATE POLICY delete_saved_accommodations ON saved_accommodations
  FOR DELETE
  USING (auth.uid() = user_id); 