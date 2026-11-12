import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Household, Profile } from './types';

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  household: Household | null;
  /** Re-read profile and household after they change. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    // Keep this callback synchronous: Supabase calls made inside it can hang.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      setHousehold(null);
      setLoadedFor(null);
      return;
    }
    const [p, h] = await Promise.all([
      supabase.from('users').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('household').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setHousehold((h.data as Household | null) ?? null);
    setLoadedFor(uid);
  }, []);

  useEffect(() => {
    if (sessionReady) load(userId);
  }, [sessionReady, userId, load]);

  const value: AuthState = {
    loading: !sessionReady || loadedFor !== userId,
    session,
    profile,
    household,
    refresh: () => load(userId),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
