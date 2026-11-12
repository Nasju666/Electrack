import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { lookOf } from '@/lib/appliances';
import { formatKwh, formatPeso } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { change, dayOf, fetchUsage, lastDays, total } from '@/lib/usage';
import { Card, colors, ErrorText, Header, IconTile, Notice, Pill, Screen, SectionTitle, Stat, StateCard, styles } from '@/lib/ui';

type Insight = {
  recommendation_id: number;
  appliance_id: number | null;
  insight_type: 'Usage Pattern' | 'Unusual Usage' | 'Energy Saving';
  pattern_summary: string | null;
  recommendation_text: string;
  estimated_savings_kwh: number | null;
  insight_date: string | null;
  generated_at: string;
};

export default function Coach() {
  const router = useRouter();
  const live = useLive();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [week, setWeek] = useState<{ kwh: number; versus: ReturnType<typeof change> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [list, currentRate, usage] = await Promise.all([
            supabase.from('ai_recommendation').select('*').order('recommendation_id'),
            supabase.rpc('current_rate'),
            fetchUsage(13, 'day'),
          ]);
          if (list.error) throw new Error(list.error.message);
          setInsights((list.data ?? []) as Insight[]);
          const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
          setRate(perKwh != null ? Number(perKwh) : null);
          const days = lastDays(14).map((d) => d.key);
          const sumOf = (keys: string[]) => total(usage.filter((r) => keys.includes(dayOf(r))));
          const thisWeek = sumOf(days.slice(7));
          setWeek({ kwh: thisWeek, versus: change(thisWeek, sumOf(days.slice(0, 7))) });
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }, []),
  );

  const all = insights ?? [];
  const twoWeeksAgo = lastDays(14)[0].key;
  const unusual = all
    .filter((i) => i.insight_type === 'Unusual Usage' && (i.insight_date ?? '') >= twoWeeksAgo)
    .sort((a, b) => (b.insight_date ?? '').localeCompare(a.insight_date ?? ''));
  const actions = all
    .filter((i) => i.insight_type === 'Energy Saving')
    .sort((a, b) => Number(b.estimated_savings_kwh ?? 0) - Number(a.estimated_savings_kwh ?? 0));
  const patterns = all.filter((i) => i.insight_type === 'Usage Pattern');
  const household = patterns.find((p) => p.appliance_id === null);
  const totalSaving = actions.reduce((sum, i) => sum + Number(i.estimated_savings_kwh ?? 0), 0);
  const analysed = all.reduce((latest, i) => (i.generated_at > latest ? i.generated_at : latest), '');
  const lookFor = (id: number | null) => lookOf(live.appliances?.find((a) => a.appliance_id === id)?.appliance_category);

  return (
    <Screen bottom>
      <Header title="AI Energy Coach" subtitle="Personalized from your recorded usage" onBack={() => router.back()} />
      <ErrorText>{error}</ErrorText>

      {week ? (
        <Card accent>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.caps, { flex: 1, color: colors.brand }]}>● Last 7 days</Text>
          </View>
          <Text style={[styles.h2, { lineHeight: 24 }]}>
            {!week.versus
              ? 'Here is your last week of monitored usage.'
              : week.versus.pct === 0
                ? 'Usage is steady compared with the week before.'
                : week.versus.lower
                  ? 'Usage is down compared with the week before.'
                  : 'Usage is up compared with the week before.'}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Stat label="Total use" value={`${formatKwh(week.kwh)} kWh`} />
            <Stat label="vs week before" value={week.versus ? `${week.versus.pct > 0 ? '+' : week.versus.pct < 0 ? '−' : ''}${Math.abs(week.versus.pct).toFixed(1)}%` : '—'} valueColor={week.versus ? (week.versus.lower ? colors.brand : colors.amber) : undefined} />
          </View>
          {household?.pattern_summary ? <Text style={[styles.small, { marginTop: 12 }]}>{household.pattern_summary}</Text> : null}
        </Card>
      ) : null}

      {!insights ? (
        error ? null : <StateCard kind="loading" title="Loading your insights" />
      ) : all.length === 0 ? (
        <StateCard
          kind="empty"
          title="No insights yet"
          text="ElecTrack studies your readings once a day. Saving tips and usage patterns appear after about a week of data, and unusual-usage checks after about two weeks."
        />
      ) : (
        <>
          <View style={[styles.sectionTitle, { marginTop: 6 }]}>
            <Text style={styles.h2}>Priority actions</Text>
            {actions.length > 0 ? <Pill text={`${actions.length} FOR YOU`} tone="ok" /> : null}
          </View>
          {actions.length === 0 ? <Text style={[styles.body, { marginBottom: 12 }]}>No suggestions right now.</Text> : null}
          {actions.map((i, index) => {
            const kwh = Number(i.estimated_savings_kwh ?? 0);
            const look = lookFor(i.appliance_id);
            return (
              <Card key={i.recommendation_id}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IconTile icon={look.icon} tone={look.tone} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.caps, { color: index === 0 ? colors.danger : colors.amber, fontWeight: '700' }]}>{index === 0 ? 'Highest impact' : 'Easy win'}</Text>
                    <Text style={[styles.h3, { marginTop: 4 }]}>{i.recommendation_text}</Text>
                    {i.pattern_summary ? <Text style={[styles.small, { marginTop: 4 }]}>{i.pattern_summary}</Text> : null}
                    {kwh > 0 ? (
                      <Text style={[styles.small, { color: colors.brand, fontWeight: '700', marginTop: 8 }]}>
                        Could save about {formatKwh(kwh)} kWh a month{rate !== null ? ` · ${formatPeso(kwh * rate)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}
          {totalSaving > 0 ? (
            <Notice
              tone="ok"
              icon="sparkles-outline"
              text={`Estimated impact: around ${formatKwh(totalSaving)} kWh less a month${rate !== null ? `, about ${formatPeso(totalSaving * rate)}` : ''}. Actual savings may vary.`}
            />
          ) : null}

          <SectionTitle title="Unusual usage" />
          {unusual.length === 0 ? <Text style={[styles.body, { marginBottom: 12 }]}>Nothing unusual in the last two weeks.</Text> : null}
          {unusual.map((i) => (
            <Card key={i.recommendation_id}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <IconTile icon="analytics-outline" tone="warn" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.h3}>{i.recommendation_text}</Text>
                  {i.pattern_summary ? <Text style={[styles.small, { marginTop: 4 }]}>{i.pattern_summary}</Text> : null}
                </View>
              </View>
            </Card>
          ))}

          <SectionTitle title="Usage patterns" />
          {patterns.map((i) => {
            const look = i.appliance_id === null ? { icon: 'home-outline' as const, tone: 'ok' as const } : lookFor(i.appliance_id);
            return (
              <Card key={i.recommendation_id}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IconTile icon={look.icon} tone={look.tone} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h3}>{i.recommendation_text}</Text>
                    {i.pattern_summary ? <Text style={[styles.small, { marginTop: 4 }]}>{i.pattern_summary}</Text> : null}
                  </View>
                </View>
              </Card>
            );
          })}
          {analysed ? (
            <Text style={styles.footnote}>
              Last analysed {new Date(analysed).toLocaleDateString([], { month: 'short', day: 'numeric' })} · Monitored appliances only
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
