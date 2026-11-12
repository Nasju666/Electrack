import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { Summary } from '@/lib/admin';
import { formatKwh, formatPeso, manilaClock, MONTHS } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Card, colors, ErrorText, Header, IconTile, Meter, Pill, Screen, StateCard, styles, tone, type IconName, type Tone } from '@/lib/ui';

export default function AdminReports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [report, current] = await Promise.all([supabase.rpc('admin_summary'), supabase.rpc('current_rate')]);
        if (report.error) return setError(report.error.message);
        setError(null);
        setSummary(report.data as Summary);
        const perKwh = (current.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
        setRate(perKwh != null ? Number(perKwh) : null);
      })();
    }, []),
  );

  const clock = manilaClock();
  const month = MONTHS[clock.getUTCMonth()];

  if (!summary) {
    return (
      <Screen>
        <Header title="Summary reports" admin />
        <ErrorText>{error}</ErrorText>
        {error ? null : <StateCard kind="loading" title="Building the report" />}
      </Screen>
    );
  }

  const alerts: { label: string; count: number; icon: IconName; tone: Tone }[] = [
    { label: 'High usage', count: summary.alerts_high_usage, icon: 'warning-outline', tone: 'danger' },
    { label: 'Device offline', count: summary.alerts_offline, icon: 'cloud-offline-outline', tone: 'info' },
    { label: 'Unusual usage', count: summary.alerts_unusual ?? 0, icon: 'analytics-outline', tone: 'warn' },
  ];
  const alertTotal = alerts.reduce((sum, a) => sum + a.count, 0);
  const totalKwh = Number(summary.month_kwh);
  const cell = { fontSize: 12, color: colors.text, fontVariant: ['tabular-nums' as const] };

  return (
    <Screen>
      <Header title="Summary reports" admin subtitle={`${month} ${clock.getUTCFullYear()} · 1–${clock.getUTCDate()}`} />

      <Card accent>
        <Text style={styles.caps}>Total consumption this month</Text>
        <Text style={[styles.big, { marginTop: 6 }]}>
          {formatKwh(totalKwh)}
          <Text style={styles.unit}> kWh</Text>
        </Text>
        <Text style={[styles.small, { marginTop: 4 }]}>
          {formatKwh(Number(summary.today_kwh))} kWh today · {summary.households} {summary.households === 1 ? 'household' : 'households'}
          {rate !== null ? ` · about ${formatPeso(totalKwh * rate)} in energy charges` : ''}
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconTile icon="flash-outline" tone="info" size={34} />
          <Text style={[styles.h3, { flex: 1 }]}>Smart plugs</Text>
          <Pill text={`Online ${summary.devices_online}`} tone="ok" />
          <Pill text={`Offline ${summary.devices_paired - summary.devices_online}`} tone="muted" />
        </View>
        <Text style={[styles.tiny, { marginTop: 8 }]}>{summary.devices_unpaired} registered but not paired to a household</Text>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
          <Text style={[styles.h2, { flex: 1 }]}>Alerts this month</Text>
          <Text style={[styles.small, { color: colors.amber, fontWeight: '700' }]}>{alertTotal} total</Text>
        </View>
        {alerts.map((a) => (
          <View key={a.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <IconTile icon={a.icon} tone={a.tone} size={30} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={[styles.small, { flex: 1, color: colors.text }]}>{a.label}</Text>
                <Text style={styles.small}>{a.count}</Text>
              </View>
              <Meter fraction={alertTotal > 0 ? a.count / alertTotal : 0} color={tone(a.tone).fg} />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={[styles.h2, { flex: 1 }]}>Households</Text>
          <Text style={[styles.small, { color: colors.brand }]}>{formatKwh(totalKwh)} kWh total</Text>
        </View>
        <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
          <Text style={[styles.tiny, { flex: 2.4 }]}>Household</Text>
          <Text style={[styles.tiny, { flex: 1, textAlign: 'right' }]}>kWh</Text>
          <Text style={[styles.tiny, { flex: 1.4, textAlign: 'right' }]}>Est. bill</Text>
          <Text style={[styles.tiny, { flex: 0.8, textAlign: 'right' }]}>Plugs</Text>
        </View>
        {summary.by_household.length === 0 ? <Text style={styles.body}>No households yet.</Text> : null}
        {summary.by_household.map((h) => (
          <View key={h.household_id} style={[{ flexDirection: 'row', paddingVertical: 10 }, styles.rowBorder]}>
            <Text style={[cell, { flex: 2.4, fontWeight: '600' }]} numberOfLines={1}>
              {h.household_name}
              {h.account_status === 'Inactive' ? ' (deactivated)' : ''}
            </Text>
            <Text style={[cell, { flex: 1, textAlign: 'right' }]}>{formatKwh(Number(h.month_kwh))}</Text>
            <Text style={[cell, { flex: 1.4, textAlign: 'right' }]}>{rate !== null ? formatPeso(Number(h.month_kwh) * rate) : '—'}</Text>
            <Text style={[cell, { flex: 0.8, textAlign: 'right' }]}>{h.devices}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.footnote}>
        Partial month to date. Estimated energy charges{rate !== null ? ` at the approved ${formatPeso(rate)}/kWh` : ''}; other fees excluded.
      </Text>
    </Screen>
  );
}
