import { create } from 'zustand';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  init: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: string | null }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  error: null,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, user: data.session?.user ?? null, loading: false });
      if (data.session?.user) {
        get().refreshProfile();
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false });
      if (session?.user) {
        get().refreshProfile();
      } else {
        set({ profile: null });
      }
    });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      return;
    }
    if (!data) {
      // Auto-create profile on first login (e.g. Google OAuth)
      const meta = user.user_metadata as { display_name?: string; full_name?: string; name?: string; avatar_url?: string; picture?: string } | null;
      const displayName = meta?.display_name ?? meta?.full_name ?? meta?.name ?? user.email?.split('@')[0] ?? 'Family Member';
      const avatarUrl = meta?.avatar_url ?? meta?.picture ?? null;
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: user.id, display_name: displayName, avatar_url: avatarUrl })
        .select()
        .single();
      set({ profile: newProfile as Profile | null });
      return;
    }
    set({ profile: data as Profile });
  },

  signInWithEmail: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      return { error: error.message };
    }
    return { error: null };
  },

  signUpWithEmail: async (email, password, displayName) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) {
      set({ error: error.message });
      return { error: error.message };
    }
    // Create profile row
    if (data.user) {
      await supabase
        .from('profiles')
        .insert({ id: data.user.id, display_name: displayName });
    }
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  updateProfile: async (updates) => {
    const { user } = get();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    if (error) return { error: error.message };
    set({ profile: data as Profile });
    return { error: null };
  },
}));
