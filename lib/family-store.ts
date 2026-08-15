import { create } from 'zustand';
import { supabase } from './supabase';
import type { Family, Profile, MotorSession, SosAlert, RingAlert, TankType } from './types';
import { generateFamilyCode } from './helpers';
import { notifyMotorAction, notifyGateToggle } from './sound-notifications';

interface FamilyState {
  family: Family | null;
  members: Profile[];
  membersReady: boolean;
  activeMotorSession: MotorSession | null;
  recentSos: SosAlert | null;
  incomingRing: RingAlert | null;
  isGateLocked: boolean;
  loading: boolean;
  error: string | null;

  createFamily: (name: string, userId: string) => Promise<{ error: string | null }>;
  joinFamily: (code: string, userId: string) => Promise<{ error: string | null }>;
  subscribe: (familyId: string) => void;
  unsubscribe: () => void;
  fetchMotorSession: (familyId: string) => Promise<void>;
  toggleGate: (senderName?: string) => boolean;
  broadcastMotorAction: (action: 'start' | 'stop', session: MotorSession | null, tank?: TankType, senderName?: string) => void;
  sendRingAlert: (targetId: string | null, senderId: string, senderName: string) => Promise<void>;
  clearIncomingRing: () => void;
  clearSos: () => void;
}

let subscriptions: { unsubscribe: () => void }[] = [];
let subscribedFamilyId: string | null = null;
let activeHubChannel: ReturnType<typeof supabase.channel> | null = null;

/** Tear down realtime channels WITHOUT wiping cached data. */
function dropChannels() {
  subscriptions.forEach((s) => s.unsubscribe());
  subscriptions = [];
  subscribedFamilyId = null;
  activeHubChannel = null;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  family: null,
  members: [],
  membersReady: false,
  activeMotorSession: null,
  recentSos: null,
  incomingRing: null,
  isGateLocked: true,
  loading: false,
  error: null,

  createFamily: async (name, userId) => {
    set({ error: null, loading: true });
    const code = generateFamilyCode();
    const { data: fam, error: famError } = await supabase
      .from('families')
      .insert({ name, code, created_by: userId })
      .select()
      .single();
    if (famError) {
      set({ error: famError.message, loading: false });
      return { error: famError.message };
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: fam.id })
      .eq('id', userId);
    if (profileError) {
      set({ error: profileError.message, loading: false });
      return { error: profileError.message };
    }
    set({ family: fam as Family, loading: false });
    get().subscribe(fam.id);
    return { error: null };
  },

  joinFamily: async (code, userId) => {
    set({ error: null, loading: true });
    const cleanCode = code.trim().toUpperCase();
    const { data: fam, error: famError } = await supabase
      .from('families')
      .select('*')
      .ilike('code', cleanCode)
      .maybeSingle();
    if (famError) {
      set({ error: famError.message, loading: false });
      return { error: famError.message };
    }
    if (!fam) {
      set({ error: `Family code "${cleanCode}" not found. Check the code and try again.`, loading: false });
      return { error: 'Family code not found' };
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: fam.id })
      .eq('id', userId);
    if (profileError) {
      set({ error: profileError.message, loading: false });
      return { error: profileError.message };
    }
    set({ family: fam as Family, loading: false });
    get().subscribe(fam.id);
    return { error: null };
  },

  subscribe: (familyId) => {
    // If already subscribed to this family, do nothing — avoids wiping data and blinking
    if (subscribedFamilyId === familyId) return;

    // Drop old channels without clearing cached data
    dropChannels();
    subscribedFamilyId = familyId;

    // Load family (only if we don't already have it)
    const currentFamily = get().family;
    if (!currentFamily || currentFamily.id !== familyId) {
      supabase
        .from('families')
        .select('*')
        .eq('id', familyId)
        .single()
        .then(({ data }) => {
          if (data) {
            const fam = data as Family;
            set({ family: fam, isGateLocked: fam.is_gate_locked ?? true });
          }
        });
    }

    // Subscribe to DB changes on families table (for real-time gate persistence across all devices)
    const familyDbSub = supabase
      .channel(`fam-db-${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'families', filter: `id=eq.${familyId}` },
        (payload) => {
          if (payload.new) {
            const updatedFam = payload.new as Family;
            set({
              family: updatedFam,
              isGateLocked: updatedFam.is_gate_locked ?? get().isGateLocked,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to members
    const membersSub = supabase
      .channel(`members-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `family_id=eq.${familyId}` },
        () => {
          supabase
            .from('profiles')
            .select('*')
            .eq('family_id', familyId)
            .order('display_name')
            .then(({ data }) => {
              if (data) set({ members: data as Profile[] });
            });
        }
      )
      .subscribe();

    // Initial members load (only if we don't already have members for this family)
    const currentMembers = get().members;
    const hasMembersForFamily = currentMembers.length > 0 && get().family?.id === familyId;
    if (!hasMembersForFamily) {
      supabase
        .from('profiles')
        .select('*')
        .eq('family_id', familyId)
        .order('display_name')
        .then(({ data }) => {
          if (data) set({ members: data as Profile[], membersReady: true });
        });
    } else {
      // We already have fresh data — mark ready immediately
      set({ membersReady: true });
    }

    // Subscribe to motor sessions
    const motorSub = supabase
      .channel(`motor-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'motor_sessions', filter: `family_id=eq.${familyId}` },
        () => {
          supabase
            .from('motor_sessions')
            .select('*')
            .eq('family_id', familyId)
            .eq('is_active', true)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              set({ activeMotorSession: data as MotorSession | null });
            });
        }
      )
      .subscribe();

    // Initial motor session
    supabase
      .from('motor_sessions')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        set({ activeMotorSession: data as MotorSession | null });
      });

    // Subscribe to SOS alerts
    const sosSub = supabase
      .channel(`sos-${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sos_alerts', filter: `family_id=eq.${familyId}` },
        (payload) => {
          set({ recentSos: payload.new as SosAlert });
        }
      )
      .subscribe();

    // Subscribe to ring alerts
    const ringSub = supabase
      .channel(`ring-${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ring_alerts', filter: `family_id=eq.${familyId}` },
        (payload) => {
          set({ incomingRing: payload.new as RingAlert });
        }
      )
      .subscribe();

    // Subscribe to unified realtime hub channel for instant cross-device broadcast signals
    const hubSub = supabase
      .channel(`hub-${familyId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'gate_toggle' }, (payload) => {
        if (payload?.payload?.isGateLocked !== undefined) {
          set({ isGateLocked: payload.payload.isGateLocked });
          notifyGateToggle(payload.payload.isGateLocked, payload.payload.sender_name);
        }
      })
      .on('broadcast', { event: 'motor_toggle' }, (payload) => {
        if (payload?.payload) {
          set({ activeMotorSession: payload.payload.session ?? null });
          notifyMotorAction(payload.payload.action, payload.payload.tank, payload.payload.sender_name);
        }
      })
      .on('broadcast', { event: 'ring_user' }, (payload) => {
        if (payload?.payload) {
          set({
            incomingRing: {
              id: payload.payload.id || 'ring-broadcast',
              family_id: familyId,
              sender_id: payload.payload.sender_id,
              target_id: payload.payload.target_id ?? null,
              created_at: new Date().toISOString(),
            },
          });
        }
      })
      .subscribe();

    activeHubChannel = hubSub;
    subscriptions = [familyDbSub, membersSub, motorSub, sosSub, ringSub, hubSub];
  },

  /** Full reset — only call on sign-out */
  unsubscribe: () => {
    dropChannels();
    set({ family: null, members: [], membersReady: false, activeMotorSession: null, recentSos: null, incomingRing: null });
  },

  fetchMotorSession: async (familyId: string) => {
    const { data } = await supabase
      .from('motor_sessions')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    set({ activeMotorSession: data as MotorSession | null });
  },

  toggleGate: (senderName) => {
    const famId = get().family?.id;
    const nextState = !get().isGateLocked;
    set({ isGateLocked: nextState });

    if (famId) {
      supabase.from('families').update({ is_gate_locked: nextState }).eq('id', famId).then();
    }

    if (activeHubChannel) {
      activeHubChannel.send({
        type: 'broadcast',
        event: 'gate_toggle',
        payload: { isGateLocked: nextState, sender_name: senderName ?? 'Family Member' },
      });
    }
    return nextState;
  },

  broadcastMotorAction: (action, session, tank, senderName) => {
    if (activeHubChannel) {
      activeHubChannel.send({
        type: 'broadcast',
        event: 'motor_toggle',
        payload: { action, session, tank, sender_name: senderName ?? 'Family Member' },
      });
    }
  },

  sendRingAlert: async (targetId, senderId, senderName) => {
    const famId = get().family?.id;
    if (!famId) return;

    const { data } = await supabase
      .from('ring_alerts')
      .insert({
        family_id: famId,
        sender_id: senderId,
        target_id: targetId,
      })
      .select()
      .maybeSingle();

    if (activeHubChannel) {
      activeHubChannel.send({
        type: 'broadcast',
        event: 'ring_user',
        payload: {
          id: data?.id,
          sender_id: senderId,
          target_id: targetId,
          sender_name: senderName,
        },
      });
    }
  },

  clearIncomingRing: () => set({ incomingRing: null }),
  clearSos: () => set({ recentSos: null }),
}));
