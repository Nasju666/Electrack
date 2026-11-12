import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { prettyDate, type Rate, type Summary } from '@/lib/admin';
import { formatKwh, formatPeso, manilaClock, MONTHS } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, Header, IconTile, Pill, Screen, SectionTitle, StateCard, styles, type IconName } from '@/lib/ui';

type LogRow = { log_id: number; action_type: string; action_details: string | null; action_timestamp: string };

export default function AdminDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [report, current, actions] = await Promise.all([
          supabase.rpc('admin_summary'),
          supabase.rpc('current_rate'),
          supabase.from('admin_action_log').select('*').order('action_timestamp', { ascending: false }).limit(5),
        ]);
        if (report.error) return setError(report.error.message);
        setError(null);
        setSummary(report.data as Summary);
        const r = current.data as Rate | null;
        setRate(r?.electricityrate_id != null ? r : null);
        setLog((actions.data ?? []) as LogRow[]);
      })();
    }, []),
  );

  const clock = manilaClock();
  const month = MONTHS[clock.getUTCMonth()];
  const tile = (icon: IconName, label: string, value: string, note: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={colors.brand} />
        <Text style={styles.small}>{label}</Text>
      </View>
      <Text style={[styles.big, { fontSize: 26, marginTop: 8 }]}>{value}</Text>
      <Text style={styles.tiny}>{note}</Text>
    </Card>
  );

  return (
    <Screen>
      <Header title="Dashboard" admin subtitle={`All households · ${month} ${clock.getUTCFullYear()}`} />
      <ErrorText>{error}</ErrorText>
      {!summary ? (
        error ? null : <StateCard kind="loading" title="Loading the dashboard" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            {tile('home-outline', 'Households', String(summary.households), `${summary.residents_active} active · ${summary.residents_inactive} deactivated`)}
            {tile('flash-outline', 'Active smart plugs', `${summary.devices_online} / ${summary.devices_paired}`, `Online · ${summary.devices_unpaired} not paired`)}
            {tile('pulse-outline', 'Consumption this month', `${formatKwh(Number(summary.month_kwh))} kWh`, `${formatKwh(Number(summary.today_kwh))} kWh today`)}
            {tile('notifications-outline', 'Alerts this month', String(summary.alerts_high_usage + summary.alerts_offline + (summary.alerts_unusual ?? 0)), `Across ${summary.households} households`)}
          </View>

          <Card accent>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.h2, { flex: 1 }]}>Current VECO rate</Text>
              {summary.pending_rates > 0 ? <Pill text={`${summary.pending_rates} PENDING`} tone="warn" /> : rate ? <Pill text="APPROVED" tone="ok" /> : <Pill text="NONE" tone="danger" />}
            </View>
            <Text style={[styles.big, { marginTop: 10 }]}>
              {rate ? formatPeso(Number(rate.rate_per_kwh)) : '—'}
              <Text style={styles.unit}> / kWh</Text>
            </Text>
            <Text style={[styles.small, { marginTop: 8 }]}>
              {rate ? `Effective ${prettyDate(rate.effective_from)}. Used for estimates until a new rate is approved.` : 'No approved rate. Bill estimates are hidden until you approve one.'}
            </Text>
            <Button title={summary.pending_rates > 0 ? 'Review rate' : 'Manage rate'} onPress={() => router.push('/admin/rates')} />
          </Card>

          <SectionTitle title="Recent admin actions" />
          <Card style={{ paddingVertical: 4 }}>
            {log.length === 0 ? <Text style={[styles.body, { paddingVertical: 12 }]}>Nothing yet.</Text> : null}
            {log.map((entry, i) => (
              <View key={entry.log_id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <IconTile icon={entry.action_type.includes('Rate') ? 'checkmark-outline' : 'person-outline'} tone="info" size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.h3}>{entry.action_type}</Text>
                  <Text style={styles.tiny} numberOfLines={1}>
                    {entry.action_details} · {prettyDate(entry.action_timestamp)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
