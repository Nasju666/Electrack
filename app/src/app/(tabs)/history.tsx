import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  dayKey,
  formatKwh,
  formatPeso,
  hourKey,
  hourLabel,
  manilaClock,
  manilaInstant,
  MONTHS,
  WEEKDAYS,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Appliance } from '@/lib/types';
import { Card, colors, ErrorText, Screen } from '@/lib/ui';

type RangeId = 'today' | 'week' | 'month';
const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
];

type Slot = { key: string; axis: string; title: string };
type UsageRow = { bucket: string; appliance_id: number; kwh: number };

/** The bars to draw for a range (in Philippine time) and where the range starts. */
function buildRange(range: RangeId): { slots: Slot[]; from: Date; bucket: 'hour' | 'day' } {
  const now = manilaClock();
  const [y, m, d] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()];

  if (range === 'today') {
    const slots = Array.from({ length: 24 }, (_, h) => ({
      key: hourKey(new Date(Date.UTC(y, m, d, h))),
      axis: h % 6 === 0 ? hourLabel(h).replace(' ', '').toLowerCase() : '',
      title: `${hourLabel(h)} to ${hourLabel((h + 1) % 24)}`,
    }));
    return { slots, from: manilaInstant(y, m, d), bucket: 'hour' };
  }

  const days = range === 'week' ? 7 : 30;
  const slots = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.UTC(y, m, d - (days - 1 - i)));
    const date = day.getUTCDate();
    return {
      key: dayKey(day),
      axis: days === 7 ? WEEKDAYS[day.getUTCDay()] : i % 5 === 4 || i === 0 ? String(date) : '',
      title: `${WEEKDAYS[day.getUTCDay()]}, ${MONTHS[day.getUTCMonth()].slice(0, 3)} ${date}`,
    };
  });
  return { slots, from: manilaInstant(y, m, d - (days - 1)), bucket: 'day' };
}

export default function History() {
  const [range, setRange] = useState<RangeId>('today');
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [only, setOnly] = useState<number | null>(null); // appliance filter
  const [picked, setPicked] = useState<string | null>(null); // tapped bar
  const [error, setError] = useState<string | null>(null);

  const { slots, from, bucket } = useMemo(() => buildRange(range), [range]);

  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [usage, list, currentRate] = await Promise.all([
      supabase.rpc('usage_buckets', { p_from: from.toISOString(), p_to: new Date().toISOString(), p_bucket: bucket }),
      supabase.from('appliance').select('*'), // includes removed ones, so old history keeps its names
      supabase.rpc('current_rate'),
    ]);
    if (id !== requestId.current) return;
    if (usage.error) return setError(usage.error.message);
    setError(null);
    setRows(((usage.data ?? []) as UsageRow[]).map((r) => ({ ...r, kwh: Number(r.kwh) })));
    setAppliances((list.data ?? []) as Appliance[]);
    const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
    setRate(perKwh != null ? Number(perKwh) : null);
  }, [from, bucket]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function changeRange(next: RangeId) {
    if (next === range) return;
    setRows(null);
    setPicked(null);
    setRange(next);
  }

  // Totals per bar (respecting the appliance filter) and per appliance.
  const keyLength = bucket === 'hour' ? 13 : 10;
  const perSlot: Record<string, number> = {};
  const perAppliance: Record<number, number> = {};
  for (const r of rows ?? []) {
    perAppliance[r.appliance_id] = (perAppliance[r.appliance_id] ?? 0) + r.kwh;
    if (only === null || only === r.appliance_id) {
      const key = r.bucket.slice(0, keyLength);
      perSlot[key] = (perSlot[key] ?? 0) + r.kwh;
    }
  }
  const householdTotal = Object.values(perAppliance).reduce((a, b) => a + b, 0);
  const shownTotal = only === null ? householdTotal : (perAppliance[only] ?? 0);
  const maxBar = Math.max(...slots.map((slot) => perSlot[slot.key] ?? 0), 0);
  const ranked = Object.entries(perAppliance)
    .map(([id, kwh]) => ({ id: Number(id), kwh }))
    .sort((a, b) => b.kwh - a.kwh);
  const nameOf = (id: number) => appliances.find((a) => a.appliance_id === id)?.appliance_name ?? 'Appliance';
  const pickedSlot = slots.find((slot) => slot.key === picked);
  const pickedKwh = pickedSlot ? (perSlot[pickedSlot.key] ?? 0) : 0;
  const cost = (kwh: number) => (rate != null ? ` · ${formatPeso(kwh * rate)}` : '');

  return (
    <Screen edges={[]}>
      <View style={s.ranges}>
        {RANGES.map((r) => (
          <Pressable key={r.id} onPress={() => changeRange(r.id)} style={[s.range, r.id === range && s.rangeOn]}>
            <Text style={[s.rangeText, r.id === range && s.rangeTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>

      {!rows ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : householdTotal === 0 ? (
        <Text style={s.empty}>
          No energy recorded in this period yet. History fills in as your devices report readings.
        </Text>
      ) : (
        <>
          <Card>
            <Text style={s.caption}>{only === null ? 'All appliances' : nameOf(only)}</Text>
            <Text style={s.total}>
              {formatKwh(shownTotal)}
              <Text style={s.totalUnit}> kWh</Text>
            </Text>
            <Text style={s.sub}>
              {rate != null
                ? `About ${formatPeso(shownTotal * rate)} at ${formatPeso(rate)} per kWh`
                : 'Cost appears once an admin approves the VECO rate'}
            </Text>

            <Text style={s.detail}>
              {pickedSlot
                ? `${pickedSlot.title} · ${formatKwh(pickedKwh)} kWh${cost(pickedKwh)}`
                : `Tap a bar for details. Tallest bar: ${formatKwh(maxBar)} kWh`}
            </Text>
            <View style={s.plot}>
              <View style={[s.grid, { top: 0 }]} />
              <View style={[s.grid, { top: '50%' }]} />
              {slots.map((slot) => {
                const value = perSlot[slot.key] ?? 0;
                const height = maxBar > 0 ? Math.max((value / maxBar) * 100, value > 0 ? 2 : 0) : 0;
                const dim = picked !== null && picked !== slot.key;
                return (
                  <Pressable
                    key={slot.key}
                    style={s.column}
                    onPress={() => setPicked(picked === slot.key ? null : slot.key)}
                    accessibilityLabel={`${slot.title}, ${formatKwh(value)} kilowatt-hours`}
                  >
                    <View style={[s.bar, { height: `${height}%` }, dim && { opacity: 0.35 }]} />
                  </Pressable>
                );
              })}
            </View>
            <View style={s.axis}>
              {slots.map((slot) => (
                <View key={slot.key} style={s.axisCell}>
                  <Text style={s.axisText} numberOfLines={1}>
                    {slot.axis}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Text style={s.heading}>BY APPLIANCE</Text>
          <Card>
            {ranked.map((item, index) => {
              const on = only === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setOnly(on ? null : item.id)}
                  style={[s.row, index > 0 && s.rowBorder]}
                >
                  <View style={s.rowTop}>
                    <Text style={[s.rowName, on && { color: colors.brand, fontWeight: '700' }]} numberOfLines={1}>
                      {nameOf(item.id)}
                    </Text>
                    <Text style={s.rowValue}>
                      {formatKwh(item.kwh)} kWh{cost(item.kwh)}
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${(item.kwh / ranked[0].kwh) * 100}%` }]} />
                  </View>
                  <Text style={s.share}>
                    {Math.round((item.kwh / householdTotal) * 100)}% of household use
                    {on ? ' · showing in chart, tap to clear' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
          <Text style={s.note}>Tap an appliance to see only its history in the chart.</Text>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  ranges: { flexDirection: 'row', backgroundColor: '#E6EAE8', borderRadius: 10, padding: 3, marginBottom: 16 },
  range: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  rangeOn: { backgroundColor: colors.card },
  rangeText: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  rangeTextOn: { color: colors.text, fontWeight: '700' },
  empty: { fontSize: 15, color: colors.muted, lineHeight: 22, marginTop: 24 },
  caption: { fontSize: 13, color: colors.muted },
  total: { fontSize: 36, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 16, fontWeight: '500', color: colors.muted },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  detail: { fontSize: 13, color: colors.text, marginTop: 16, marginBottom: 8, fontVariant: ['tabular-nums'] },
  plot: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#C9D0CD',
  },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#EEF1F0' },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: 1 },
  bar: { backgroundColor: '#1B7F5E', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', marginTop: 4 },
  axisCell: { flex: 1, alignItems: 'center', overflow: 'visible' },
  axisText: { fontSize: 10, color: colors.muted, width: 40, textAlign: 'center' },
  heading: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  row: { paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'baseline' },
  rowName: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingRight: 8 },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F0', marginTop: 8 },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#1B7F5E' },
  share: { fontSize: 12, color: colors.muted, marginTop: 6 },
  note: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
