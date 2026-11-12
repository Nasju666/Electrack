import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { isConfigured, supabase } from './lib/supabase';

type Appliance = {
  appliance_id: number;
  appliance_name: string;
  appliance_location: string | null;
  outlet_no: number;
  smart_plug: { smartplug_name: string | null } | null;
};

type Reading = {
  appliance_id: number;
  reading_watts: number;
  reading_timestamp: string;
};

// A device reports every 30 s at most; after 90 s of silence we call it offline.
const STALE_AFTER_MS = 90_000;

export default function App() {
  const [appliances, setAppliances] = useState<Appliance[] | null>(null);
  const [latest, setLatest] = useState<Record<number, Reading>>({});
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Re-render every second so "x s ago" and the offline state stay current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;

    const remember = (r: Reading) =>
      setLatest((prev) => ({ ...prev, [r.appliance_id]: { ...r, reading_watts: Number(r.reading_watts) } }));

    // Subscribe first so no reading is missed while the initial load runs.
    const channel = supabase
      .channel('live-readings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'consumption_reading' },
        (payload) => remember(payload.new as Reading),
      )
      .subscribe();

    (async () => {
      const { data, error } = await supabase
        .from('appliance')
        .select('appliance_id, appliance_name, appliance_location, outlet_no, smart_plug(smartplug_name)')
        .order('appliance_id');
      if (cancelled) return;
      if (error) return setError(error.message);
      const list = (data ?? []) as unknown as Appliance[];
      setAppliances(list);

      // Last known reading for each appliance, so the screen is not empty on open.
      for (const a of list) {
        const { data: rows } = await supabase
          .from('consumption_reading')
          .select('appliance_id, reading_watts, reading_timestamp')
          .eq('appliance_id', a.appliance_id)
          .order('reading_timestamp', { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (rows?.[0]) {
          const row = rows[0] as Reading;
          // Keep whichever is newer: this row or one that already arrived live.
          setLatest((prev) =>
            prev[row.appliance_id] && Date.parse(prev[row.appliance_id].reading_timestamp) >= Date.parse(row.reading_timestamp)
              ? prev
              : { ...prev, [row.appliance_id]: { ...row, reading_watts: Number(row.reading_watts) } },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const isLive = (r?: Reading) => !!r && now - new Date(r.reading_timestamp).getTime() < STALE_AFTER_MS;
  const totalWatts = (appliances ?? []).reduce(
    (sum, a) => sum + (isLive(latest[a.appliance_id]) ? latest[a.appliance_id].reading_watts : 0),
    0,
  );

  let body;
  if (!isConfigured) {
    body = <Message title="Not connected yet" text="Copy app/.env.example to app/.env.local, fill in your Supabase URL and publishable key, then restart with: npx expo start -c" />;
  } else if (error) {
    body = <Message title="Could not load appliances" text={error} />;
  } else if (!appliances) {
    body = <ActivityIndicator style={{ marginTop: 48 }} color="#0B3B2E" />;
  } else if (appliances.length === 0) {
    body = <Message title="No appliances" text="Run the database migration to add the demo household." />;
  } else {
    body = (
      <FlatList
        data={appliances}
        keyExtractor={(a) => String(a.appliance_id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const reading = latest[item.appliance_id];
          const live = isLive(reading);
          return (
            <View style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.name}>{item.appliance_name}</Text>
                <Text style={styles.sub}>
                  {item.smart_plug?.smartplug_name ?? 'Smart plug'} · outlet {item.outlet_no}
                  {item.appliance_location ? ` · ${item.appliance_location}` : ''}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: live ? '#1FA971' : '#B6BDC2' }]} />
                  <Text style={styles.status}>
                    {!reading ? 'No data yet' : live ? `Live · ${secondsAgo(reading, now)}s ago` : `Offline · last seen ${timeOf(reading)}`}
                  </Text>
                </View>
              </View>
              <Text style={[styles.watts, !live && styles.wattsStale]}>
                {reading ? formatWatts(reading.reading_watts) : '—'}
                <Text style={styles.unit}> W</Text>
              </Text>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>ElecTrack</Text>
        <Text style={styles.totalLabel}>Using right now</Text>
        <Text style={styles.total}>
          {formatWatts(totalWatts)}
          <Text style={styles.totalUnit}> W</Text>
        </Text>
      </View>
      {body}
    </View>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageText}>{text}</Text>
    </View>
  );
}

const formatWatts = (w: number) => (w >= 100 ? Math.round(w).toLocaleString('en-US') : w.toFixed(1));
const secondsAgo = (r: Reading, now: number) =>
  Math.max(0, Math.round((now - new Date(r.reading_timestamp).getTime()) / 1000));
const timeOf = (r: Reading) =>
  new Date(r.reading_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F5F4' },
  header: {
    backgroundColor: '#0B3B2E',
    paddingTop: (RNStatusBar.currentHeight ?? 24) + 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  brand: { color: '#9FD8C0', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  totalLabel: { color: '#D5E6DF', fontSize: 14, marginTop: 16 },
  total: { color: '#FFFFFF', fontSize: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 22, fontWeight: '500', color: '#D5E6DF' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E3E7E5',
  },
  cardText: { flex: 1, paddingRight: 12 },
  name: { fontSize: 17, fontWeight: '600', color: '#14211C' },
  sub: { fontSize: 13, color: '#5E6B66', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 12, color: '#5E6B66' },
  watts: { fontSize: 26, fontWeight: '700', color: '#14211C', fontVariant: ['tabular-nums'] },
  wattsStale: { color: '#A3ABA7' },
  unit: { fontSize: 14, fontWeight: '500', color: '#5E6B66' },
  message: { padding: 24, marginTop: 24 },
  messageTitle: { fontSize: 18, fontWeight: '600', color: '#14211C', marginBottom: 8 },
  messageText: { fontSize: 14, color: '#5E6B66', lineHeight: 20 },
});
