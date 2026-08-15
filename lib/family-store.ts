import { create } from 'zustand';
import { supabase } from './supabase';
import type { Family, Profile, MotorSession, SosAlert, RingAlert, TankType, QuickAction } from './types';
import { generateFamilyCode } from './helpers';
import { notifyMotorAction, notifyGateToggle, stopContinuousAlarm, notifyProximityAlert, notifyHomeArrival, notifyHomeDeparture } from './sound-notifications';
import { getCurrentUserLocation, updateUserLocationInDB, calculateDistance, formatDistance } from './location-utils';
import { sendExpoPushNotification } from './push-notifications';
import { sendEmergencyEmailToFamily } from './email-service';

interface FamilyState {
  family: Family | null;
  members: Profile[];
  membersReady: boolean;
  activeMotorSession: MotorSession | null;
  recentSos: SosAlert | null;
  incomingRing: RingAlert | null;
  quickActions: QuickAction[];
  isGateLocked: boolean;
  motorAlarmActive: boolean;
  myLocation: { latitude: number; longitude: number } | null;
  loading: boolean;
  error: string | null;

  createFamily: (name: string, userId: string) => Promise<{ error: string | null }>;
  joinFamily: (code: string, userId: string) => Promise<{ error: string | null }>;
  subscribe: (familyId: string) => void;
  unsubscribe: () => void;
  fetchMotorSession: (familyId: string) => Promise<void>;
  fetchQuickActions: (familyId: string) => Promise<void>;
  createQuickAction: (actionData: Partial<QuickAction>) => Promise<boolean>;
  updateQuickAction: (id: string, actionData: Partial<QuickAction>) => Promise<boolean>;
  deleteQuickAction: (id: string) => Promise<boolean>;
  toggleGate: (senderName?: string) => boolean;
  broadcastMotorAction: (action: 'start' | 'stop' | 'expire', session: MotorSession | null, tank?: TankType, senderName?: string) => void;
  sendRingAlert: (targetId: string | null, senderId: string, senderName: string) => Promise<void>;
  updateMyLocation: (userId: string, senderName?: string) => Promise<{ latitude: number; longitude: number } | null>;
  broadcastLocationUpdate: (latitude: number, longitude: number, senderId: string, senderName: string) => void;
  setHomeLocation: (latitude: number, longitude: number, addressName?: string) => Promise<boolean>;
  promoteToAdmin: (targetUserId: string) => Promise<boolean>;
  demoteToMember: (targetUserId: string) => Promise<boolean>;
  removeMember: (targetUserId: string) => Promise<boolean>;
  clearIncomingRing: () => void;
  clearSos: () => void;
  setMotorAlarmActive: (active: boolean) => void;
  silenceMotorAlarm: () => void;
}

let subscriptions: { unsubscribe: () => void }[] = [];
let subscribedFamilyId: string | null = null;
let activeHubChannel: ReturnType<typeof supabase.channel> | null = null;
let memberGeofenceState = new Map<string, boolean>();

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
  quickActions: [],
  isGateLocked: true,
  motorAlarmActive: false,
  myLocation: null,
  loading: false,
  error: null,

  createFamily: async (name, userId) => {
    set({ error: null, loading: true });
    const code = generateFamilyCode();

    // Fetch creator's GPS location to establish Family Home Location automatically
    const initialLoc = await getCurrentUserLocation();

    const familyData: any = {
      name,
      code,
      created_by: userId,
    };
    if (initialLoc) {
      familyData.home_latitude = initialLoc.latitude;
      familyData.home_longitude = initialLoc.longitude;
      familyData.home_address_name = 'Family Home';
      familyData.home_radius_meters = 200;
    }

    const { data: fam, error: famError } = await supabase
      .from('families')
      .insert(familyData)
      .select()
      .single();
    if (famError) {
      set({ error: famError.message, loading: false });
      return { error: famError.message };
    }

    const profileUpdateData: any = { family_id: fam.id, role: 'admin' };
    if (initialLoc) {
      profileUpdateData.latitude = initialLoc.latitude;
      profileUpdateData.longitude = initialLoc.longitude;
      profileUpdateData.location_updated_at = new Date().toISOString();
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdateData)
      .eq('id', userId);
    if (profileError) {
      set({ error: profileError.message, loading: false });
      return { error: profileError.message };
    }
    set({ family: fam as Family, myLocation: initialLoc, loading: false });
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
      .update({ family_id: fam.id, role: 'member' })
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
          if (payload.payload.action === 'expire') {
            set({ motorAlarmActive: true });
          } else if (payload.payload.action === 'stop') {
            stopContinuousAlarm();
            set({ motorAlarmActive: false });
          }
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
      .on('broadcast', { event: 'location_update' }, (payload) => {
        if (payload?.payload?.sender_id && payload?.payload?.latitude && payload?.payload?.longitude) {
          const { sender_id, latitude, longitude, sender_name } = payload.payload;
          const updatedMembers = get().members.map((m) =>
            m.id === sender_id ? { ...m, latitude, longitude, location_updated_at: new Date().toISOString() } : m
          );
          set({ members: updatedMembers });

          // 1. Geofence Arrival / Departure tracking relative to Family Home Location
          const currentFamily = get().family;
          if (currentFamily?.home_latitude && currentFamily?.home_longitude) {
            const homeRadius = currentFamily.home_radius_meters ?? 200;
            const distToHome = calculateDistance(latitude, longitude, currentFamily.home_latitude, currentFamily.home_longitude);
            const isNowAtHome = distToHome <= homeRadius;
            const wasAtHome = memberGeofenceState.get(sender_id);

            if (wasAtHome !== undefined && wasAtHome !== isNowAtHome) {
              if (isNowAtHome) {
                notifyHomeArrival(sender_name || 'A family member');
              } else {
                notifyHomeDeparture(sender_name || 'A family member', formatDistance(distToHome));
              }
            }
            memberGeofenceState.set(sender_id, isNowAtHome);
          }

          // 2. Check if sender is near my location (< 500 meters)
          const myLoc = get().myLocation;
          if (myLoc) {
            const dist = calculateDistance(myLoc.latitude, myLoc.longitude, latitude, longitude);
            if (dist <= 500) {
              const distText = formatDistance(dist);
              notifyProximityAlert(sender_name || 'A family member', distText);
            }
          }
        }
      })
      .subscribe();

    // Subscribe to quick actions
    const quickActionsSub = supabase
      .channel(`quick-actions-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quick_actions', filter: `family_id=eq.${familyId}` },
        () => {
          get().fetchQuickActions(familyId);
        }
      )
      .subscribe();

    get().fetchQuickActions(familyId);

    activeHubChannel = hubSub;
    subscriptions = [familyDbSub, membersSub, motorSub, sosSub, ringSub, hubSub, quickActionsSub];
  },

  /** Full reset — only call on sign-out */
  unsubscribe: () => {
    dropChannels();
    memberGeofenceState.clear();
    set({ family: null, members: [], membersReady: false, activeMotorSession: null, recentSos: null, incomingRing: null, myLocation: null });
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

    // Send Expo Push Notification to target member(s)
    const targetMembers = targetId
      ? get().members.filter((m) => m.id === targetId)
      : get().members.filter((m) => m.id !== senderId);

    const pushTokens = targetMembers
      .map((m) => m.push_token)
      .filter((t): t is string => !!t && t.startsWith('ExponentPushToken'));

    if (pushTokens.length > 0) {
      sendExpoPushNotification(
        pushTokens,
        `🔔 ${senderName} is ringing you!`,
        `Tap to open FamilyHub and respond.`,
        { type: 'ring', senderId }
      );
    }
  },

  updateMyLocation: async (userId: string, senderName?: string) => {
    const loc = await getCurrentUserLocation();
    if (!loc) return null;

    set({ myLocation: loc });
    await updateUserLocationInDB(userId, loc.latitude, loc.longitude);
    get().broadcastLocationUpdate(loc.latitude, loc.longitude, userId, senderName ?? 'Family Member');
    return loc;
  },

  broadcastLocationUpdate: (latitude: number, longitude: number, senderId: string, senderName: string) => {
    if (activeHubChannel) {
      activeHubChannel.send({
        type: 'broadcast',
        event: 'location_update',
        payload: {
          sender_id: senderId,
          latitude,
          longitude,
          sender_name: senderName,
        },
      });
    }
  },

  setHomeLocation: async (latitude: number, longitude: number, addressName?: string) => {
    const famId = get().family?.id;
    if (!famId) return false;

    const { error } = await supabase
      .from('families')
      .update({
        home_latitude: latitude,
        home_longitude: longitude,
        home_address_name: addressName || 'Family Home',
        home_radius_meters: 200,
      })
      .eq('id', famId);

    if (!error) {
      set((state) => ({
        family: state.family
          ? {
              ...state.family,
              home_latitude: latitude,
              home_longitude: longitude,
              home_address_name: addressName || 'Family Home',
              home_radius_meters: 200,
            }
          : null,
      }));
      return true;
    }
    return false;
  },

  promoteToAdmin: async (targetUserId: string) => {
    const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', targetUserId);
    if (!error) {
      set((state) => ({
        members: state.members.map((m) => (m.id === targetUserId ? { ...m, role: 'admin' } : m)),
      }));
      return true;
    }
    return false;
  },

  demoteToMember: async (targetUserId: string) => {
    const { error } = await supabase.from('profiles').update({ role: 'member' }).eq('id', targetUserId);
    if (!error) {
      set((state) => ({
        members: state.members.map((m) => (m.id === targetUserId ? { ...m, role: 'member' } : m)),
      }));
      return true;
    }
    return false;
  },

  removeMember: async (targetUserId: string) => {
    const { error } = await supabase.from('profiles').update({ family_id: null, role: 'member' }).eq('id', targetUserId);
    if (!error) {
      set((state) => ({
        members: state.members.filter((m) => m.id !== targetUserId),
      }));
      return true;
    }
    return false;
  },

  fetchQuickActions: async (familyId: string) => {
    const { data, error } = await supabase
      .from('quick_actions')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      if (data.length === 0) {
        // Seed default quick actions if none exist
        const defaultActions = [
          {
            family_id: familyId,
            title: 'Top Tank Motor',
            action_type: 'motor',
            tank: 'top',
            default_duration_minutes: 30,
            icon: 'droplets',
            color: '#0284C7',
          },
          {
            family_id: familyId,
            title: 'Down Tank Motor',
            action_type: 'motor',
            tank: 'down',
            default_duration_minutes: 30,
            icon: 'droplets',
            color: '#059669',
          },
          {
            family_id: familyId,
            title: 'Custom Alarm Timer',
            action_type: 'alarm',
            default_duration_minutes: 15,
            icon: 'bell',
            color: '#7C3AED',
          },
        ];
        const { data: seeded } = await supabase.from('quick_actions').insert(defaultActions).select();
        if (seeded) {
          set({ quickActions: seeded as QuickAction[] });
          return;
        }
      }
      set({ quickActions: data as QuickAction[] });
    }
  },

  createQuickAction: async (actionData) => {
    const { family } = get();
    if (!family) return false;
    const { data, error } = await supabase
      .from('quick_actions')
      .insert({ ...actionData, family_id: family.id })
      .select()
      .single();
    if (!error && data) {
      set((state) => ({ quickActions: [...state.quickActions, data as QuickAction] }));
      return true;
    }
    return false;
  },

  updateQuickAction: async (id, actionData) => {
    const { error, data } = await supabase
      .from('quick_actions')
      .update(actionData)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      set((state) => ({
        quickActions: state.quickActions.map((q) => (q.id === id ? (data as QuickAction) : q)),
      }));
      return true;
    }
    return false;
  },

  deleteQuickAction: async (id) => {
    const { error } = await supabase.from('quick_actions').delete().eq('id', id);
    if (!error) {
      set((state) => ({
        quickActions: state.quickActions.filter((q) => q.id !== id),
      }));
      return true;
    }
    return false;
  },

  clearIncomingRing: () => set({ incomingRing: null }),
  clearSos: () => set({ recentSos: null }),
  setMotorAlarmActive: (active: boolean) => set({ motorAlarmActive: active }),
  silenceMotorAlarm: () => {
    stopContinuousAlarm();
    set({ motorAlarmActive: false });
  },
}));
