import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatKwh, formatPeso, formatWatts, manilaClock, MONTHS } from '@/lib/format';
import { isRecent, type Appliance, type Reading } from '@/lib/types';
import { Button, colors } from '@/lib/ui';

type Row = Appliance & { smart_plug: { smartplug_name: string | null } | null };

type Bill = {
  usage_sofar_kwh: number;
  forecast_kwh: number | null;
  estimated_cost: number;
  cost_sofar: number;
  rate_per_kwh: number;
};

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { household } = useAuth();
  const [appliances, setAppliances] = useState<Row[] | null>(null);
  const [latest, setLatest] = useState<Record<number, Reading>>({});
  const [error, setError] = useState<string | null>(null);
  // undefined = still loading, null = no approved rate yet
  const [bill, setBill] = useState<Bill | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());

  // Re-render every second so "x s ago" and the offline state stay current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep the newest reading per appliance, wherever it came from.
  const remember = useCallback((r: Reading) => {
    setLatest((prev) => {
      const have = prev[r.appliance_id];
      if (have && Date.parse(have.reading_timestamp) >= Date.parse(r.reading_timestamp)) return prev;
      return { ...prev, [r.appliance_id]: { ...r, reading_watts: Number(r.reading_watts) } };
    });
  }, []);

  // Live feed. The database only sends this user readings from their own household.
  useEffect(() => {
    const channel = supabase
      .channel('live-readings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'consumption_reading' }, (payload) =>
        remember(payload.new as Reading),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [remember]);

  // Reload the appliance list whenever this tab comes back into view,
  // because devices and appliances are edited on other screens.
  const requestId = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const id = ++requestId.current;
      // Recalculate this month's estimate each time the tab opens.
      supabase.rpc('refresh_bill_estimate').then(({ data }) => {
        if (id === requestId.current) setBill((data as Bill | null) ?? null);
      });
      (async () => {
        const { data, error } = await supabase
          .from('appliance')
          .select('*, smart_plug(smartplug_name)')
          .eq('appliance_status', 'Active')
          .order('smartplug_id')
          .order('outlet_no');
        if (id !== requestId.current) return;
        if (error) return setError(error.message);
        setError(null);
        const list = (data ?? []) as unknown as Row[];
        setAppliances(list);
        for (const a of list) {
          const { data: rows } = await supabase
            .from('consumption_reading')
            .select('appliance_id, reading_watts, reading_timestamp')
            .eq('appliance_id', a.appliance_id)
            .order('reading_timestamp', { ascending: false })
            .limit(1);
          if (id !== requestId.current) return;
          if (rows?.[0]) remember(rows[0] as Reading);
        }
      })();
    }, [remember]),
  );

  const live = (a: Row) => isRecent(latest[a.appliance_id]?.reading_timestamp, now);
  const totalWatts = (appliances ?? []).reduce((sum, a) => sum + (live(a) ? latest[a.appliance_id].reading_watts : 0), 0);

  let body;
  if (error) {
    body = <Empty title="Could not load appliances" text={error} />;
  } else if (!appliances) {
    body = <ActivityIndicator style={{ marginTop: 48 }} color={colors.brand} />;
  } else if (appliances.length === 0) {
    body = (
      <Empty
        title="Nothing is being monitored yet"
        text="Pair an ElecTrack device, then tell the app what is plugged into it."
      >
        <Button title="Set up devices" onPress={() => router.push('/devices')} />
      </Empty>
    );
  } else {
    body = (
      <FlatList
        data={appliances}
        keyExtractor={(a) => String(a.appliance_id)}
        contentContainerStyle={s.list}
        ListHeaderComponent={<BillCard bill={bill} />}
        renderItem={({ item }) => {
          const reading = latest[item.appliance_id];
          const isLive = live(item);
          return (
            <View style={s.card}>
              <View style={s.cardText}>
                <Text style={s.name}>{item.appliance_name}</Text>
                <Text style={s.sub}>
                  {item.smart_plug?.smartplug_name ?? 'Smart plug'} · outlet {item.outlet_no}
                  {item.appliance_location ? ` · ${item.appliance_location}` : ''}
                </Text>
                <View style={s.statusRow}>
                  <View style={[s.dot, { backgroundColor: isLive ? colors.live : '#B6BDC2' }]} />
                  <Text style={s.status}>
                    {!reading
                      ? 'Waiting for the first reading'
                      : isLive
                        ? `Live · ${secondsAgo(reading, now)}s ago`
                        : `Offline · last seen ${timeOf(reading)}`}
                  </Text>
                </View>
              </View>
              <Text style={[s.watts, !isLive && { color: colors.faint }]}>
                {reading ? formatWatts(reading.reading_watts) : '—'}
                <Text style={s.unit}> W</Text>
              </Text>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.brand}>{(household?.household_name ?? 'ElecTrack').toUpperCase()}</Text>
        <Text style={s.totalLabel}>Using right now</Text>
        <Text style={s.total}>
          {formatWatts(totalWatts)}
          <Text style={s.totalUnit}> W</Text>
        </Text>
      </View>
      {body}
    </View>
  );
}

function BillCard({ bill }: { bill: Bill | null | undefined }) {
  if (bill === undefined) return null;
  const month = MONTHS[manilaClock().getUTCMonth()];
  if (bill === null) {
    return (
      <View style={s.bill}>
        <Text style={s.billCaption}>{month.toUpperCase()} BILL ESTIMATE</Text>
        <Text style={s.billNote}>Not available yet. An administrator has to approve the VECO rate first.</Text>
      </View>
    );
  }
  const projected = bill.forecast_kwh != null;
  return (
    <View style={s.bill}>
      <Text style={s.billCaption}>{month.toUpperCase()} BILL ESTIMATE</Text>
      <Text style={s.billAmount}>{formatPeso(Number(projected ? bill.estimated_cost : bill.cost_sofar))}</Text>
      <Text style={s.billLine}>
        {projected
          ? `Projected for the whole month · about ${formatKwh(Number(bill.forecast_kwh))} kWh`
          : 'So far this month. A full-month projection appears after one day of readings.'}
      </Text>
      {projected ? (
        <Text style={s.billLine}>
          So far: {formatPeso(Number(bill.cost_sofar))} · {formatKwh(Number(bill.usage_sofar_kwh))} kWh
        </Text>
      ) : null}
      <Text style={s.billNote}>
        Monitored appliances only, at the approved VECO residential rate of {formatPeso(Number(bill.rate_per_kwh))} per
        kWh. Your actual bill may differ.
      </Text>
    </View>
  );
}

function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <View style={{ padding: 24, marginTop: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 }}>{text}</Text>
      {children}
    </View>
  );
}

const secondsAgo = (r: Reading, now: number) =>
  Math.max(0, Math.round((now - new Date(r.reading_timestamp).getTime()) / 1000));
const timeOf = (r: Reading) =>
  new Date(r.reading_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.brand, paddingHorizontal: 20, paddingBottom: 24 },
  brand: { color: colors.brandSoft, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  totalLabel: { color: '#D5E6DF', fontSize: 14, marginTop: 16 },
  total: { color: '#FFFFFF', fontSize: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 22, fontWeight: '500', color: '#D5E6DF' },
  list: { padding: 16, gap: 12 },
  bill: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billCaption: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  billAmount: { fontSize: 32, fontWeight: '700', color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  billLine: { fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 19 },
  billNote: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardText: { flex: 1, paddingRight: 12 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 12, color: colors.muted },
  watts: { fontSize: 26, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, fontWeight: '500', color: colors.muted },
});
