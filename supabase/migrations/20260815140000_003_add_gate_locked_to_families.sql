/*
# Add Gate Lock to Families Table & Update RLS Policy

1. Adds `is_gate_locked` boolean column (default `true`) to `families` table.
2. Updates `update_own_family` RLS policy so all family members can update family settings (gate lock state).
*/

ALTER TABLE families ADD COLUMN IF NOT EXISTS is_gate_locked BOOLEAN DEFAULT true NOT NULL;

DROP POLICY IF EXISTS "update_own_family" ON families;
CREATE POLICY "update_own_family" ON families FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.family_id = families.id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.family_id = families.id)
  );
