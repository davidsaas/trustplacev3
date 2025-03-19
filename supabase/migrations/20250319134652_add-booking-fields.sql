-- Add new columns for Booking.com fields
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS amenities text[],
  ADD COLUMN IF NOT EXISTS address jsonb DEFAULT jsonb_build_object(
    'street', null,
    'postal_code', null,
    'country', null,
    'region', null
  );

-- Make price_per_night nullable
ALTER TABLE accommodations ALTER COLUMN price_per_night DROP NOT NULL;

-- Update the room_type enum to include Booking.com room types
DO $$ BEGIN
  ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'entire_home';
  ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'private_room';
  ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'shared_room';
  ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'hotel_room';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
