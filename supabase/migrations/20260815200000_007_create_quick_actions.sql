/*
  # Create quick_actions table
  
  Allows family admins to create custom quick actions (motor timers, alarms, custom tasks)
  which all family members can trigger with one tap.
*/

CREATE TABLE IF NOT EXISTS quick_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('motor', 'alarm', 'custom')),
  tank text CHECK (tank IN ('top', 'down') OR tank IS NULL),
  default_duration_minutes int NOT NULL DEFAULT 30,
  icon text DEFAULT 'zap',
  color text DEFAULT '#0EA5E9',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE quick_actions ENABLE ROW LEVEL SECURITY;

-- Select policy
CREATE POLICY "Users can view quick actions in their family" ON quick_actions
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- Insert/Update/Delete policy for admins
CREATE POLICY "Admins can manage quick actions in their family" ON quick_actions
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );
