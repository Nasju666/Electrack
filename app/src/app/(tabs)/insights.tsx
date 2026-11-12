import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { lookOf } from '@/lib/appliances';
import { formatKwh, formatPeso, hourKey, hourLabel, manilaClock } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Appliance } from '@/lib/types';
import { change, dayOf, fetchUsage, lastDays, sumBy, total, type UsageRow } from '@/lib/usage';
import { Bars, Card, colors, ErrorText, Header, IconTile, Meter, Pill, Screen, SectionTitle, Segmented, Stat, StateCard, styles, tone, type Bar } from '@/lib/ui';

type Period = 'day' | 'week' | 'month';
const PERIODS = [
  { id: 'day' as const, label: 'Daily' },
  { id: 'week' as const, label: 'Weekly' },
  { id: 'month' as const, label: 'Monthly' },
];
const SPAN = { week: 7, month: 30 };

export default function Insights() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      // Twice the period, so it can be compared with the one before it.
      const [usage, list, currentRate] = await Promise.all([
        period === 'day' ? fetchUsage(1, 'hour') : fetchUsage(SPAN[period] * 2 - 1, 'day'),
        supabase.from('appliance').select('*'), // includes removed ones, so old history keeps its names
        supabase.rpc('current_rate'),
      ]);
      if (id !== requestId.current) return;
      setRows(usage);
      setAppliances((list.data ?? []) as Appliance[]);
      const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
      setRate(perKwh != null ? Number(perKwh) : null);
      setError(null);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function switchTo(next: Period) {
    if (next === period) return;
    setRows(null);
    setPicked(null);
    setPeriod(next);
  }

  // The bars of the current period, and the rows of the current and previous periods.
  const view = useMemo(() => {
    const all = rows ?? [];
    if (period === 'day') {
      const clock = manilaClock();
      const [today, yesterday] = [lastDays(1)[0].key, lastDays(2)[0].key];
      const hour = clock.getUTCHours();
      const current = all.filter((r) => dayOf(r) === today);
      const perHour = sumBy(current, (r) => r.bucket.slice(0, 13));
      const bars: Bar[] = Array.from({ length: 24 }, (_, h) => {
        const key = hourKey(new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate(), h)));
        return { key, label: h % 6 === 0 ? hourLabel(h).replace(' ', '').toLowerCase() : '', value: perHour[key] ?? 0, title: `${hourLabel(h)} to ${hourLabel((h + 1) % 24)}` };
      });
      // Compare like with like: both days up to the last completed hour.
      const upToNow = (day: string) => all.filter((r) => dayOf(r) === day && Number(r.bucket.slice(11, 13)) < hour);
      return { bars, current, label: 'Today', versus: hour > 0 ? change(total(upToNow(today)), total(upToNow(yesterday))) : null, versusLabel: 'this time yesterday' };
    }
    const span = SPAN[period];
    const days = lastDays(span * 2);
    const now = new Set(days.slice(span).map((d) => d.key));
    const before = new Set(days.slice(0, span).map((d) => d.key));
    const current = all.filter((r) => now.has(dayOf(r)));
    const previous = all.filter((r) => before.has(dayOf(r)));
    const perDay = sumBy(current, dayOf);
    const bars: Bar[] = days.slice(span).map((d, i) => ({
      key: d.key,
      label: span === 7 ? d.letter : i % 5 === 4 || i === 0 ? String(Number(d.key.slice(8))) : '',
      value: perDay[d.key] ?? 0,
      title: d.title,
    }));
    const first = days[span].title.split(', ')[1];
    const last = days[span * 2 - 1].title.split(', ')[1];
    return { bars, current, label: `${first} – ${last}`, versus: change(total(current), total(previous)), versusLabel: `the previous ${span} days` };
  }, [rows, period]);

  const totalKwh = total(view.current);
  const perAppliance = Object.entries(sumBy(view.current, (r) => r.appliance_id))
    .map(([id, kwh]) => ({ appliance: appliances.find((a) => a.appliance_id === Number(id)), id: Number(id), kwh }))
    .sort((a, b) => b.kwh - a.kwh);
  const pickedBar = view.bars.find((b) => b.key === picked);
  const busiest = view.bars.reduce((best, b) => (b.value > best.value ? b : best), view.bars[0]);
  const daysWithData = view.bars.filter((b) => b.value > 0).length;

  return (
    <Screen>
      <Header title="Insights" subtitle="Patterns from recorded usage" />
      <Segmented options={PERIODS} value={period} onChange={switchTo} />
      <ErrorText>{error}</ErrorText>

      {!rows ? (
        error ? null : <StateCard kind="loading" title="Refreshing energy data" />
      ) : totalKwh === 0 ? (
        <StateCard kind="empty" title="No usage data yet" text="Nothing was recorded in this period. History fills in as your devices report readings." />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.caps, { flex: 1 }]}>{view.label}</Text>
              {view.versus ? <Pill text={view.versus.short} tone={view.versus.lower ? 'ok' : 'warn'} icon={view.versus.lower ? 'trending-down' : 'trending-up'} /> : null}
            </View>
            <Text style={[styles.big, { marginTop: 6 }]}>
              {formatKwh(totalKwh)}
              <Text style={styles.unit}> kWh</Text>
            </Text>
            <Text style={[styles.small, { color: colors.cyan, marginBottom: 16 }]}>
              {rate !== null ? `${formatPeso(totalKwh * rate)} estimated` : 'Cost appears once the VECO rate is approved'}
            </Text>
            <Bars data={view.bars} selected={picked} onSelect={setPicked} />
            <Text style={[styles.small, { marginTop: 12 }]}>
              {pickedBar
                ? `${pickedBar.title} · ${formatKwh(pickedBar.value)} kWh${rate !== null ? ` · ${formatPeso(pickedBar.value * rate)}` : ''}`
                : view.versus
                  ? `${view.versus.phrase} ${view.versusLabel}. Tap a bar for details.`
                  : 'Tap a bar for details.'}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <Ionicons name="time-outline" size={18} color={colors.amber} />
              <View style={{ height: 8 }} />
              <Stat label={period === 'day' ? 'Peak hour' : 'Highest day'} value={period === 'day' ? busiest.title.split(' to ')[0] : busiest.title.split(', ')[1]} valueColor={colors.amber} note={`${formatKwh(busiest.value)} kWh`} />
            </Card>
            <Card style={{ flex: 1 }}>
              <Ionicons name="pulse-outline" size={18} color={colors.cyan} />
              <View style={{ height: 8 }} />
              <Stat
                label={period === 'day' ? 'Hourly average' : 'Daily average'}
                value={`${formatKwh(totalKwh / Math.max(1, daysWithData))} kWh`}
                valueColor={colors.cyan}
                note={period === 'day' ? `Over ${daysWithData} hours with use` : `Over ${daysWithData} days with use`}
              />
            </Card>
          </View>

          <SectionTitle title="Usage by appliance" />
          <Card>
            {perAppliance.map(({ appliance, id, kwh }, index) => {
              const look = lookOf(appliance?.appliance_category);
              const active = appliance?.appliance_status === 'Active';
              return (
                <Pressable
                  key={id}
                  disabled={!active}
                  onPress={() => router.push({ pathname: '/appliance-details', params: { id: String(id) } })}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, index > 0 && styles.rowBorder]}
                >
                  <IconTile icon={look.icon} tone={look.tone} size={34} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                      <Text style={[styles.h3, { flex: 1, fontSize: 13 }]} numberOfLines={1}>
                        {appliance?.appliance_name ?? 'Appliance'}
                        {active ? '' : ' (removed)'}
                      </Text>
                      <Text style={styles.small}>
                        {formatKwh(kwh)} kWh · {Math.round((kwh / totalKwh) * 100)}%
                      </Text>
                    </View>
                    <Meter fraction={kwh / perAppliance[0].kwh} color={tone(look.tone).fg} />
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </>
      )}

      <Card accent onPress={() => router.push('/coach')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon="sparkles-outline" />
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>AI Energy Coach</Text>
            <Text style={styles.small}>Saving tips, unusual usage and your usage patterns</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.brand} />
        </View>
      </Card>
    </Screen>
  );
}
