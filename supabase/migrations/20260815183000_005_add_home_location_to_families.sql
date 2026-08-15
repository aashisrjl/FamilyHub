-- Migration: Add Family Home Location fields for geofencing and arrival/departure tracking
ALTER TABLE families
ADD COLUMN IF NOT EXISTS home_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS home_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS home_address_name TEXT,
ADD COLUMN IF NOT EXISTS home_radius_meters INT DEFAULT 200;

-- Ensure family members can update family home location if creator
DROP POLICY IF EXISTS "Family members can update family" ON families;
CREATE POLICY "Family members can update family"
  ON families FOR UPDATE
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.family_id = families.id
  ));
