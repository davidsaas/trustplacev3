-- First, drop the enum type constraint
ALTER TABLE accommodations ALTER COLUMN property_type TYPE text;

-- Now we can store the actual property types from both platforms
COMMENT ON COLUMN accommodations.property_type IS 'The actual property type from the source platform (Airbnb or Booking.com)'; 