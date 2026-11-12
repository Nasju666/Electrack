// Live readings for the signed-in resident's appliances, shared by every screen.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { isRecent, type Appliance, type Reading, type SmartPlug } from './types';

export type LiveAppliance = Appliance & {
  smart_plug: Pick<SmartPlug, 'smartplug_name' | 'device_type'> | null;
};

type Live = {
  /** Active appliances; null while loading. */
  appliances: LiveAppliance[] | null;
  error: string | null;
  /** Re-read the appliance list (after pairing, adding or removing). */
  reload: () => void;
  /** Current watts, or null if the appliance has not reported in the last 90 seconds. */
  watts: (applianceId: number) => number | null;
  lastSeen: (applianceId: number) => string | null;
  totalWatts: number;
  onlineCount: number;
};

const LiveContext = createContext<Live | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { profile, household } = useAuth();
  const enabled = profile?.user_role === 'Resident' && profile.account_status === 'Active' && !!household;

  const [appliances, setAppliances] = useState<LiveAppliance[] | null>(null);
  const [latest, setLatest] = useState<Record<number, Reading>>({});
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Re-render every 5 s so "offline" appears without waiting for another reading.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const remember = useCallback((r: Reading) => {
    setLatest((prev) => {
      const have = prev[r.appliance_id];
      if (have && Date.parse(have.reading_timestamp) >= Date.parse(r.reading_timestamp)) return prev;
      return { ...prev, [r.appliance_id]: { ...r, reading_watts: Number(r.reading_watts) } };
    });
    setNow(Date.now());
  }, []);

  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const { data, error } = await supabase
      .from('appliance')
      .select('*, smart_plug(smartplug_name, device_type)')
      .eq('appliance_status', 'Active')
      .order('smartplug_id')
      .order('outlet_no');
    if (id !== requestId.current) return;
    if (error) return setError(error.message);
    setError(null);
    const list = (data ?? []) as unknown as LiveAppliance[];
    setAppliances(list);
    // Last known reading for each, so screens are not blank until the next one arrives.
    await Promise.all(
      list.map(async (a) => {
        const { data: rows } = await supabase
          .from('consumption_reading')
          .select('appliance_id, reading_watts, reading_timestamp')
          .eq('appliance_id', a.appliance_id)
          .order('reading_timestamp', { ascending: false })
          .limit(1);
        if (rows?.[0]) remember(rows[0] as Reading);
      }),
    );
  }, [remember]);

  useEffect(() => {
    if (!enabled) {
      setAppliances(null);
      setLatest({});
      return;
    }
    reload();
    // The database only sends this user readings from their own household.
    const channel = supabase
      .channel('live-readings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'consumption_reading' }, (payload) =>
        remember(payload.new as Reading),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, reload, remember]);

  const watts = (id: number) => (isRecent(latest[id]?.reading_timestamp, now) ? latest[id].reading_watts : null);
  const live = (appliances ?? []).map((a) => watts(a.appliance_id)).filter((w): w is number => w !== null);

  const value: Live = {
    appliances,
    error,
    reload: () => void reload(),
    watts,
    lastSeen: (id) => latest[id]?.reading_timestamp ?? null,
    totalWatts: live.reduce((a, b) => a + b, 0),
    onlineCount: live.length,
  };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>');
  return ctx;
}
