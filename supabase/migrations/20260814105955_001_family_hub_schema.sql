/*
# Family Hub — Tables & RLS

Creates tables for a real-time family coordination app:
families, profiles, motor_sessions, sos_alerts, tasks, messages, ring_alerts.
All tables created first, then RLS enabled and policies added to avoid forward-reference issues.

## Tables
1. families — family group with unique 6-char join code
2. profiles — user profile linked to auth.users and a family
3. motor_sessions — active water machine timer (top/down tank)
4. sos_alerts — emergency broadcasts
5. tasks — shared or personal to-do items
6. messages — broadcast or direct chat messages with optional media
7. ring_alerts — chime notifications between members

## Security
- RLS on all tables, scoped to authenticated.
- Family membership verified via profiles.family_id subquery.
- Personal tasks only visible to owner; shared tasks visible to family.
- Direct messages only visible to sender and recipient.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ TABLES (no policies yet) ============

CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Family',
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  display_name text NOT NULL DEFAULT 'Family Member',
  avatar_url text,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online','away','dnd')),
  fcm_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS motor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  tank text NOT NULL CHECK (tank IN ('top','down')),
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  text text,
  media_url text,
  media_type text CHECK (media_type IN ('image','audio','file') OR media_type IS NULL),
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ENABLE RLS ============

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE motor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ring_alerts ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============

-- families
DROP POLICY IF EXISTS "select_own_family" ON families;
CREATE POLICY "select_own_family" ON families FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.family_id = families.id)
  );

DROP POLICY IF EXISTS "insert_family" ON families;
CREATE POLICY "insert_family" ON families FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "update_own_family" ON families;
CREATE POLICY "update_own_family" ON families FOR UPDATE
  TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- profiles
DROP POLICY IF EXISTS "select_own_or_family_profile" ON profiles;
CREATE POLICY "select_own_or_family_profile" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- motor_sessions
DROP POLICY IF EXISTS "select_family_motor" ON motor_sessions;
CREATE POLICY "select_family_motor" ON motor_sessions FOR SELECT
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_motor" ON motor_sessions;
CREATE POLICY "insert_family_motor" ON motor_sessions FOR INSERT
  TO authenticated WITH CHECK (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "update_family_motor" ON motor_sessions;
CREATE POLICY "update_family_motor" ON motor_sessions FOR UPDATE
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

-- sos_alerts
DROP POLICY IF EXISTS "select_family_sos" ON sos_alerts;
CREATE POLICY "select_family_sos" ON sos_alerts FOR SELECT
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_sos" ON sos_alerts;
CREATE POLICY "insert_family_sos" ON sos_alerts FOR INSERT
  TO authenticated WITH CHECK (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "update_family_sos" ON sos_alerts;
CREATE POLICY "update_family_sos" ON sos_alerts FOR UPDATE
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  ) WITH CHECK (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

-- tasks
DROP POLICY IF EXISTS "select_tasks" ON tasks;
CREATE POLICY "select_tasks" ON tasks FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_tasks" ON tasks;
CREATE POLICY "insert_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (
      family_id IS NULL
      OR family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_tasks" ON tasks;
CREATE POLICY "update_tasks" ON tasks FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR assignee_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  ) WITH CHECK (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delete_tasks" ON tasks;
CREATE POLICY "delete_tasks" ON tasks FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    )
  );

-- messages
DROP POLICY IF EXISTS "select_messages" ON messages;
CREATE POLICY "select_messages" ON messages FOR SELECT
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    AND (
      recipient_id IS NULL
      OR recipient_id = auth.uid()
      OR sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_messages" ON messages;
CREATE POLICY "insert_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_messages" ON messages;
CREATE POLICY "delete_messages" ON messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid());

-- ring_alerts
DROP POLICY IF EXISTS "select_ring_alerts" ON ring_alerts;
CREATE POLICY "select_ring_alerts" ON ring_alerts FOR SELECT
  TO authenticated USING (
    family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
    AND (target_id IS NULL OR target_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ring_alerts" ON ring_alerts;
CREATE POLICY "insert_ring_alerts" ON ring_alerts FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND family_id = (SELECT p.family_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_motor_sessions_family_active ON motor_sessions(family_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sos_alerts_family ON sos_alerts(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id, completed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, completed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_family ON messages(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ring_alerts_family ON ring_alerts(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_family ON profiles(family_id);
