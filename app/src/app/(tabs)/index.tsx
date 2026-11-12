import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useUnreadAlerts } from '@/lib/alerts';
import { lookOf } from '@/lib/appliances';
import { useAuth } from '@/lib/auth';
import { formatKw, formatKwh, formatPeso, manilaClock } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { change, dayOf, fetchUsage, hourOf, lastDays, sumBy, total, type UsageRow } from '@/lib/usage';
import { Bars, Card, colors, ErrorText, Header, IconButton, IconTile, Pill, Screen, SectionTitle, Stat, StateCard, styles } from '@/lib/ui';

type Bill = { forecast_kwh: number | null; estimated_cost: number; cost_sofar: number; rate_per_kwh: number };
type Insight = { insight_type: string; recommendation_text: string; insight_date: string | null };

export default function Home() {
  const router = useRouter();
  const { profile, household } = useAuth();
  const live = useLive();
  const unread = useUnreadAlerts();

  const [week, setWeek] = useState<UsageRow[] | null>(null); // per day, last 7 days
  const [hours, setHours] = useState<UsageRow[]>([]); // per hour, yesterday and today
  const [bill, setBill] = useState<Bill | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const id = ++requestId.current;
      live.reload();
      (async () => {
        try {
          const [days, hourly, estimate, insights] = await Promise.all([
            fetchUsage(6, 'day'),
            fetchUsage(1, 'hour'),
            supabase.rpc('refresh_bill_estimate'),
            supabase.from('ai_recommendation').select('insight_type, recommendation_text, insight_date, estimated_savings_kwh').order('estimated_savings_kwh', { ascending: false, nullsFirst: false }),
          ]);
          if (id !== requestId.current) return;
          setWeek(days);
          setHours(hourly);
          setBill((estimate.data as Bill | null) ?? null);
          // Show yesterday's unusual usage if there is one; otherwise the biggest saving tip.
          const list = (insights.data ?? []) as Insight[];
          const yesterday = lastDays(2)[0].key;
          setInsight(
            list.find((i) => i.insight_type === 'Unusual Usage' && (i.insight_date ?? '') >= yesterday) ??
              list.find((i) => i.insight_type === 'Energy Saving') ??
              null,
          );
          setError(null);
        } catch (e) {
          if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const clock = manilaClock();
  const hour = clock.getUTCHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const days = lastDays(7);
  const today = days[6].key;
  const yesterday = days[5].key;

  const perDay = sumBy(week ?? [], dayOf);
  const todayKwh = perDay[today] ?? 0;
  const rate = bill ? Number(bill.rate_per_kwh) : null;
  // Same stretch of the day, today against yesterday (completed hours only).
  const sameTime = (day: string) => total(hours.filter((r) => dayOf(r) === day && hourOf(r) < hour));
  const versus = hour > 0 ? change(sameTime(today), sameTime(yesterday)) : null;

  const perApplianceToday = sumBy((week ?? []).filter((r) => dayOf(r) === today), (r) => r.appliance_id);
  const top = (live.appliances ?? [])
    .map((a) => ({ a, kwh: perApplianceToday[a.appliance_id] ?? 0 }))
    .sort((x, y) => y.kwh - x.kwh)
    .slice(0, 2);

  const hasAppliances = (live.appliances?.length ?? 0) > 0;
  const pickedDay = days.find((d) => d.key === picked);

  return (
    <Screen>
      <Header
        title={household?.household_name ?? 'ElecTrack'}
        subtitle={`${greeting}, ${profile?.user_firstname ?? ''}`.trim()}
        right={<IconButton icon="notifications-outline" label="Alerts" dot={unread > 0} onPress={() => router.push('/alerts')} />}
      />
      <ErrorText>{error ?? live.error}</ErrorText>

      {live.appliances === null ? (
        <StateCard kind="loading" title="Refreshing energy data" text="Gathering the latest readings from your paired devices." />
      ) : !hasAppliances ? (
        <StateCard
          kind="empty"
          title="No usage data yet"
          text="Pair a smart plug and tell ElecTrack what is plugged in. Your first readings appear within a minute."
          action="Pair a smart plug"
          onAction={() => router.push('/pair')}
        />
      ) : (
        <>
          <Card accent>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flash-outline" size={16} color={colors.brand} />
              <Text style={[styles.body, { flex: 1 }]}>Energy today</Text>
              <Pill text={live.onlineCount > 0 ? 'LIVE' : 'OFFLINE'} tone={live.onlineCount > 0 ? 'ok' : 'muted'} icon={live.onlineCount > 0 ? 'radio-outline' : 'cloud-offline-outline'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
              <Text style={[styles.big, { flex: 1 }]}>
                {formatKwh(todayKwh)}
                <Text style={styles.unit}> kWh</Text>
              </Text>
              {rate !== null ? <Text style={{ color: colors.cyan, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>{formatPeso(todayKwh * rate)} est.</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <Stat label="Current power" value={formatKw(live.totalWatts)} note={`${live.onlineCount} of ${live.appliances.length} appliances reporting`} />
              <Pressable style={{ flex: 1 }} onPress={() => router.push('/bill')}>
                <Stat
                  label="Month projection"
                  value={bill ? formatPeso(Number(bill.forecast_kwh != null ? bill.estimated_cost : bill.cost_sofar)) : '—'}
                  note={bill ? (bill.forecast_kwh != null ? 'Tap for the estimate' : 'So far this month') : 'Waiting for an approved rate'}
                />
              </Pressable>
            </View>
            {versus ? (
              <>
                <View style={styles.divider} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={versus.lower ? 'trending-down' : 'trending-up'} size={14} color={versus.lower ? colors.brand : colors.amber} />
                  <Text style={styles.small}>
                    <Text style={{ color: versus.lower ? colors.brand : colors.amber, fontWeight: '700' }}>{versus.phrase}</Text> this time
                    yesterday
                  </Text>
                </View>
              </>
            ) : null}
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[styles.h2, { flex: 1 }]}>Usage overview</Text>
              <Text style={styles.small}>
                {pickedDay ? `${pickedDay.title} · ${formatKwh(perDay[pickedDay.key] ?? 0)} kWh` : 'Last 7 days'}
              </Text>
            </View>
            <Bars
              data={days.map((d) => ({ key: d.key, label: d.letter, value: perDay[d.key] ?? 0, title: d.title }))}
              selected={picked}
              onSelect={setPicked}
              height={110}
            />
          </Card>

          {insight ? (
            <Card accent onPress={() => router.push('/coach')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
                <Text style={[styles.h3, { flex: 1 }]}>AI insight</Text>
                <Pill text={insight.insight_type === 'Unusual Usage' ? 'UNUSUAL' : 'TIP'} tone={insight.insight_type === 'Unusual Usage' ? 'warn' : 'info'} />
              </View>
              <Text style={styles.body}>{insight.recommendation_text}</Text>
            </Card>
          ) : null}

          <SectionTitle title="Top-consuming appliances" action="See all" onAction={() => router.push('/appliances')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {top.map(({ a, kwh }) => {
              const look = lookOf(a.appliance_category);
              return (
                <Card key={a.appliance_id} style={{ flex: 1, padding: 12 }} onPress={() => router.push({ pathname: '/appliance-details', params: { id: String(a.appliance_id) } })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <IconTile icon={look.icon} tone={look.tone} size={30} />
                    <Text style={[styles.h3, { flex: 1, fontSize: 13 }]} numberOfLines={1}>
                      {a.appliance_name}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }}>
                    <Text style={[styles.tiny, { flex: 1 }]}>{todayKwh > 0 ? `${Math.round((kwh / todayKwh) * 100)}% of today` : 'No use today'}</Text>
                    <Text style={[styles.h3, { fontSize: 13 }]}>{formatKwh(kwh)} kWh</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
