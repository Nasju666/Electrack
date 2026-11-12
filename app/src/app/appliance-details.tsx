import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { lookOf } from '@/lib/appliances';
import { formatKw, formatKwh, formatPeso, manilaClock } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { change, dayOf, fetchUsage, hourOf, lastDays, sumBy, total, type UsageRow } from '@/lib/usage';
import { Bars, Card, colors, ErrorText, Header, IconButton, IconTile, Meter, Screen, Stat, StateCard, styles } from '@/lib/ui';

type Tip = { recommendation_text: string; pattern_summary: string | null; insight_type: string };

export default function ApplianceDetails() {
  const router = useRouter();
  const live = useLive();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const appliance = live.appliances?.find((a) => a.appliance_id === id);

  const [daily, setDaily] = useState<UsageRow[]>([]); // this appliance, per day, this month (at least 7 days)
  const [hourly, setHourly] = useState<UsageRow[]>([]); // this appliance, per hour, yesterday and today
  const [rate, setRate] = useState<number | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clock = manilaClock();
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [days, hours, currentRate, insights] = await Promise.all([
            fetchUsage(Math.max(6, manilaClock().getUTCDate() - 1), 'day'),
            fetchUsage(1, 'hour'),
            supabase.rpc('current_rate'),
            supabase.from('ai_recommendation').select('recommendation_text, pattern_summary, insight_type').eq('appliance_id', id).in('insight_type', ['Usage Pattern', 'Energy Saving']),
          ]);
          setDaily(days.filter((r) => r.appliance_id === id));
          setHourly(hours.filter((r) => r.appliance_id === id));
          const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
          setRate(perKwh != null ? Number(perKwh) : null);
          setTips((insights.data ?? []) as Tip[]);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }, [id]),
  );

  if (!appliance) {
    return (
      <Screen bottom>
        <Header title="Appliance" onBack={() => router.back()} />
        <StateCard kind={live.appliances === null ? 'loading' : 'empty'} title={live.appliances === null ? 'Loading' : 'This appliance is no longer monitored'} />
      </Screen>
    );
  }

  const watts = live.watts(id);
  const online = watts !== null;
  const look = lookOf(appliance.appliance_category);
  const days = lastDays(7);
  const today = days[6].key;
  const yesterday = days[5].key;
  const perDay = sumBy(daily, dayOf);
  const todayKwh = perDay[today] ?? 0;
  const monthPrefix = today.slice(0, 7);
  const monthKwh = total(daily.filter((r) => dayOf(r).startsWith(monthPrefix)));

  const hour = clock.getUTCHours();
  const sameTime = (day: string) => total(hourly.filter((r) => dayOf(r) === day && hourOf(r) < hour));
  const todaySoFar = sameTime(today);
  const yesterdaySoFar = sameTime(yesterday);
  const versus = hour > 0 ? change(todaySoFar, yesterdaySoFar) : null;
  const pickedDay = days.find((d) => d.key === picked);
  const pattern = tips.find((t) => t.insight_type === 'Usage Pattern');
  const saving = tips.find((t) => t.insight_type === 'Energy Saving');
  const threshold = appliance.usage_threshold_w != null ? Number(appliance.usage_threshold_w) : null;

  return (
    <Screen bottom>
      <Header
        title={appliance.appliance_name}
        subtitle={`${appliance.appliance_location ?? `Outlet ${appliance.outlet_no}`} · ${online ? 'Online' : 'Offline'}`}
        onBack={() => router.back()}
        right={<IconButton icon="create-outline" label="Edit appliance" onPress={() => router.push({ pathname: '/appliance', params: { id: String(id) } })} />}
      />
      <ErrorText>{error}</ErrorText>

      <Card accent>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon={look.icon} tone={look.tone} size={52} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: online ? colors.brand : colors.muted }} />
              <Text style={[styles.small, { color: online ? colors.brand : colors.muted }]}>{online ? 'Monitoring live' : 'Not reporting'}</Text>
            </View>
            <Text style={styles.big}>{online ? formatKw(watts) : '—'}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <Stat label="Today" value={`${formatKwh(todayKwh)} kWh`} />
          <Stat label="Est. cost" value={rate !== null ? formatPeso(todayKwh * rate) : '—'} />
          <Stat label="This month" value={`${formatKwh(monthKwh)} kWh`} />
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={[styles.h2, { flex: 1 }]}>Consumption</Text>
          <Text style={styles.small}>{pickedDay ? `${pickedDay.title} · ${formatKwh(perDay[pickedDay.key] ?? 0)} kWh` : 'Last 7 days'}</Text>
        </View>
        <Bars data={days.map((d) => ({ key: d.key, label: d.letter, value: perDay[d.key] ?? 0, title: d.title }))} selected={picked} onSelect={setPicked} />
        {threshold !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Ionicons name="notifications-outline" size={14} color={colors.amber} />
            <Text style={styles.small}>High-usage alert level: {threshold.toLocaleString('en-US')} W</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={[styles.h2, { marginBottom: 12 }]}>Compared with yesterday</Text>
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Stat label="Today so far" value={`${formatKwh(todaySoFar)} kWh`} valueColor={colors.amber} />
          <Stat label="Yesterday by now" value={`${formatKwh(yesterdaySoFar)} kWh`} />
        </View>
        <Meter fraction={yesterdaySoFar > 0 ? todaySoFar / Math.max(todaySoFar, yesterdaySoFar) : todaySoFar > 0 ? 1 : 0} color={colors.amber} />
        <Text style={[styles.small, { marginTop: 8 }]}>{versus ? `${versus.phrase} yesterday by this time of day` : 'Not enough data to compare yet.'}</Text>
      </Card>

      {pattern || saving ? (
        <Card accent>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
            <Text style={styles.h3}>Usage insight</Text>
          </View>
          {pattern ? <Text style={styles.body}>{pattern.recommendation_text}</Text> : null}
          {saving ? (
            <Text style={[styles.body, { marginTop: pattern ? 8 : 0 }]}>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Tip: </Text>
              {saving.recommendation_text} {saving.pattern_summary ?? ''}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Text style={styles.footnote}>ElecTrack monitors usage only and cannot switch appliances on or off.</Text>
    </Screen>
  );
}
