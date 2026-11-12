import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { formatKwh, formatPeso } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Card, colors, ErrorText, Screen } from '@/lib/ui';

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

export default function Insights() {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [list, currentRate] = await Promise.all([
          supabase.from('ai_recommendation').select('*').order('recommendation_id'),
          supabase.rpc('current_rate'),
        ]);
        if (list.error) return setError(list.error.message);
        setError(null);
        setInsights((list.data ?? []) as Insight[]);
        const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
        setRate(perKwh != null ? Number(perKwh) : null);
      })();
    }, []),
  );

  if (!insights) {
    return (
      <Screen edges={[]}>
        <ErrorText>{error}</ErrorText>
        {error ? null : <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />}
      </Screen>
    );
  }

  if (insights.length === 0) {
    return (
      <Screen edges={[]}>
        <Text style={s.empty}>
          No insights yet. ElecTrack studies your readings once a day. Usage patterns and saving tips appear after about
          a week of data, and unusual-usage checks after about two weeks.
        </Text>
      </Screen>
    );
  }

  // Unusual days: newest first, last two weeks only.
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const unusual = insights
    .filter((i) => i.insight_type === 'Unusual Usage' && (i.insight_date ?? '') >= twoWeeksAgo)
    .sort((a, b) => (b.insight_date ?? '').localeCompare(a.insight_date ?? ''));
  const savings = insights
    .filter((i) => i.insight_type === 'Energy Saving')
    .sort((a, b) => Number(b.estimated_savings_kwh ?? 0) - Number(a.estimated_savings_kwh ?? 0));
  const patterns = insights.filter((i) => i.insight_type === 'Usage Pattern');
  const totalSaving = savings.reduce((sum, i) => sum + Number(i.estimated_savings_kwh ?? 0), 0);
  const analysed = insights.reduce((latest, i) => (i.generated_at > latest ? i.generated_at : latest), '');

  return (
    <Screen edges={[]}>
      <Section icon="analytics" title="UNUSUAL USAGE" />
      {unusual.length === 0 ? (
        <Text style={s.none}>Nothing unusual in the last two weeks.</Text>
      ) : (
        unusual.map((i) => (
          <Card key={i.recommendation_id}>
            <Text style={s.main}>{i.recommendation_text}</Text>
            {i.pattern_summary ? <Text style={s.detail}>{i.pattern_summary}</Text> : null}
          </Card>
        ))
      )}

      <Section icon="leaf" title="WAYS TO SAVE" />
      {savings.length === 0 ? (
        <Text style={s.none}>No suggestions right now.</Text>
      ) : (
        <>
          {savings.map((i) => {
            const kwh = Number(i.estimated_savings_kwh ?? 0);
            return (
              <Card key={i.recommendation_id}>
                <Text style={s.main}>{i.recommendation_text}</Text>
                {i.pattern_summary ? <Text style={s.detail}>{i.pattern_summary}</Text> : null}
                {kwh > 0 ? (
                  <Text style={s.saving}>
                    Could save about {formatKwh(kwh)} kWh a month{rate != null ? `, around ${formatPeso(kwh * rate)}` : ''}
                  </Text>
                ) : null}
              </Card>
            );
          })}
          {savings.length > 1 && totalSaving > 0 ? (
            <Text style={s.none}>
              Together: about {formatKwh(totalSaving)} kWh a month{rate != null ? `, around ${formatPeso(totalSaving * rate)}` : ''}.
              These are estimates from your own usage.
            </Text>
          ) : null}
        </>
      )}

      <Section icon="time" title="USAGE PATTERNS" />
      {patterns.map((i) => (
        <Card key={i.recommendation_id}>
          <Text style={s.main}>{i.recommendation_text}</Text>
          {i.pattern_summary ? <Text style={s.detail}>{i.pattern_summary}</Text> : null}
        </Card>
      ))}

      {analysed ? (
        <Text style={s.footer}>
          Last analysed {new Date(analysed).toLocaleDateString([], { month: 'short', day: 'numeric' })}. Monitored
          appliances only.
        </Text>
      ) : null}
    </Screen>
  );
}

function Section({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={s.section}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={s.sectionText}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: 15, color: colors.muted, lineHeight: 22, marginTop: 8 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 8 },
  sectionText: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  none: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 },
  main: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 21 },
  detail: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4 },
  saving: { fontSize: 14, color: colors.brand, fontWeight: '600', marginTop: 8 },
  footer: { fontSize: 12, color: colors.muted, marginTop: 8 },
});
