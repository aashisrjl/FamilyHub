import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import type { MotorSession, TankType } from './types';
import { useFamilyStore } from './family-store';

interface UseMotorTimerResult {
  remainingSeconds: number;
  isExpired: boolean;
}

/**
 * Given an active motor session, computes remaining seconds and
 * fires a callback when the timer reaches zero.
 */
export function useMotorTimer(
  session: MotorSession | null,
  onExpire: (session: MotorSession) => void
): UseMotorTimerResult {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const expiredRef = useRef<string | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!session || !session.is_active) {
      setRemainingSeconds(0);
      setIsExpired(false);
      return;
    }

    const computeRemaining = () => {
      const startMs = new Date(session.started_at).getTime();
      const endMs = startMs + session.duration_minutes * 60 * 1000;
      const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
      if (diff === 0 && expiredRef.current !== session.id) {
        expiredRef.current = session.id;
        setIsExpired(true);
        onExpireRef.current(session);
      } else if (diff > 0) {
        setIsExpired(false);
      }
      return diff;
    };

    computeRemaining();
    const interval = setInterval(computeRemaining, 1000);
    return () => clearInterval(interval);
  }, [session]);

  return { remainingSeconds, isExpired };
}

/**
 * Start a motor session in the database.
 */
export async function startMotorSession(
  familyId: string,
  userId: string,
  tank: TankType,
  durationMinutes: number,
  senderName?: string
): Promise<{ error: string | null }> {
  // End any existing active session for this family
  await supabase
    .from('motor_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('family_id', familyId)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('motor_sessions')
    .insert({
      family_id: familyId,
      tank,
      started_by: userId,
      duration_minutes: durationMinutes,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  if (data) {
    const session = data as MotorSession;
    useFamilyStore.setState({ activeMotorSession: session });
    useFamilyStore.getState().broadcastMotorAction('start', session, tank, senderName);
  }

  // Refetch to guarantee sync
  useFamilyStore.getState().fetchMotorSession(familyId);

  return { error: null };
}

/**
 * Stop the active motor session.
 */
export async function stopMotorSession(
  sessionId: string,
  familyId?: string,
  senderName?: string
): Promise<{ error: string | null }> {
  // Instantly clear local state so UI updates without delay or refresh
  useFamilyStore.setState({ activeMotorSession: null });
  useFamilyStore.getState().broadcastMotorAction('stop', null, undefined, senderName);

  const { error } = await supabase
    .from('motor_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (familyId) {
    useFamilyStore.getState().fetchMotorSession(familyId);
  }

  return { error: error?.message ?? null };
}
