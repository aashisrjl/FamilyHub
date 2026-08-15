/*
# Fix infinite recursion in profiles RLS policies

The profiles SELECT policy subqueried profiles to resolve family_id, which
re-triggered the same policy and caused "infinite recursion detected in policy
for relation profiles".

Use a SECURITY DEFINER helper to read the caller's family_id without RLS, and
allow family creators to read their row before profiles.family_id is set.
*/

CREATE OR REPLACE FUNCTION public.get_my_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_family_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_id() TO authenticated;

-- families
DROP POLICY IF EXISTS "select_own_family" ON families;
CREATE POLICY "select_own_family" ON families FOR SELECT
  TO authenticated USING (
    id = public.get_my_family_id()
    OR created_by = auth.uid()
  );

-- profiles
DROP POLICY IF EXISTS "select_own_or_family_profile" ON profiles;
CREATE POLICY "select_own_or_family_profile" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = public.get_my_family_id()
    )
  );

-- motor_sessions
DROP POLICY IF EXISTS "select_family_motor" ON motor_sessions;
CREATE POLICY "select_family_motor" ON motor_sessions FOR SELECT
  TO authenticated USING (family_id = public.get_my_family_id());

DROP POLICY IF EXISTS "insert_family_motor" ON motor_sessions;
CREATE POLICY "insert_family_motor" ON motor_sessions FOR INSERT
  TO authenticated WITH CHECK (family_id = public.get_my_family_id());

DROP POLICY IF EXISTS "update_family_motor" ON motor_sessions;
CREATE POLICY "update_family_motor" ON motor_sessions FOR UPDATE
  TO authenticated USING (family_id = public.get_my_family_id())
  WITH CHECK (family_id = public.get_my_family_id());

-- sos_alerts
DROP POLICY IF EXISTS "select_family_sos" ON sos_alerts;
CREATE POLICY "select_family_sos" ON sos_alerts FOR SELECT
  TO authenticated USING (family_id = public.get_my_family_id());

DROP POLICY IF EXISTS "insert_family_sos" ON sos_alerts;
CREATE POLICY "insert_family_sos" ON sos_alerts FOR INSERT
  TO authenticated WITH CHECK (family_id = public.get_my_family_id());

DROP POLICY IF EXISTS "update_family_sos" ON sos_alerts;
CREATE POLICY "update_family_sos" ON sos_alerts FOR UPDATE
  TO authenticated USING (family_id = public.get_my_family_id())
  WITH CHECK (family_id = public.get_my_family_id());

-- tasks
DROP POLICY IF EXISTS "select_tasks" ON tasks;
CREATE POLICY "select_tasks" ON tasks FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = public.get_my_family_id()
    )
  );

DROP POLICY IF EXISTS "insert_tasks" ON tasks;
CREATE POLICY "insert_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (
      family_id IS NULL
      OR family_id = public.get_my_family_id()
    )
  );

DROP POLICY IF EXISTS "update_tasks" ON tasks;
CREATE POLICY "update_tasks" ON tasks FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR assignee_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = public.get_my_family_id()
    )
  ) WITH CHECK (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = public.get_my_family_id()
    )
  );

DROP POLICY IF EXISTS "delete_tasks" ON tasks;
CREATE POLICY "delete_tasks" ON tasks FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      family_id IS NOT NULL
      AND family_id = public.get_my_family_id()
    )
  );

-- messages
DROP POLICY IF EXISTS "select_messages" ON messages;
CREATE POLICY "select_messages" ON messages FOR SELECT
  TO authenticated USING (
    family_id = public.get_my_family_id()
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
    AND family_id = public.get_my_family_id()
  );

-- ring_alerts
DROP POLICY IF EXISTS "select_ring_alerts" ON ring_alerts;
CREATE POLICY "select_ring_alerts" ON ring_alerts FOR SELECT
  TO authenticated USING (
    family_id = public.get_my_family_id()
    AND (target_id IS NULL OR target_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ring_alerts" ON ring_alerts;
CREATE POLICY "insert_ring_alerts" ON ring_alerts FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND family_id = public.get_my_family_id()
  );
