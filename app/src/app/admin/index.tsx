import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { formatKwh, MONTHS, manilaClock } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, Screen } from '@/lib/ui';

type HouseholdRow = {
  household_id: number;
  household_name: string;
  owner: string;
  account_status: string;
  devices: number;
  devices_online: number;
  month_kwh: number;
  today_kwh: number;
  alerts_month: number;
};

type Summary = {
  households: number;
  residents_active: number;
  residents_inactive: number;
  devices_paired: number;
  devices_online: number;
  devices_unpaired: number;
  month_kwh: number;
  today_kwh: number;
  alerts_high_usage: number;
  alerts_offline: number;
  alerts_unusual: number;
  pending_rates: number;
  by_household: HouseholdRow[];
};

type LogRow = { log_id: number; action_type: string; action_details: string | null; action_timestamp: string };

export default function AdminSummary() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [report, actions] = await Promise.all([
          supabase.rpc('admin_summary'),
          supabase.from('admin_action_log').select('*').order('action_timestamp', { ascending: false }).limit(10),
        ]);
        if (report.error) return setError(report.error.message);
        setError(null);
        setSummary(report.data as Summary);
        setLog((actions.data ?? []) as LogRow[]);
      })();
    }, []),
  );

  const month = MONTHS[manilaClock().getUTCMonth()];

  return (
    <Screen edges={[]}>
      <ErrorText>{error}</ErrorText>
      {!summary ? (
        error ? null : <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <>
          {summary.pending_rates > 0 ? (
            <Card>
              <Text style={s.cardTitle}>
                {summary.pending_rates === 1 ? 'A VECO rate is' : `${summary.pending_rates} VECO rates are`} waiting for
                your approval
              </Text>
              <Button title="Review rates" onPress={() => router.push('/admin/rates')} />
            </Card>
          ) : null}

          <View style={s.grid}>
            <Stat label="Households" value={String(summary.households)} />
            <Stat
              label="Resident accounts"
              value={String(summary.residents_active + summary.residents_inactive)}
              note={summary.residents_inactive > 0 ? `${summary.residents_inactive} deactivated` : 'All active'}
            />
            <Stat
              label="Devices online"
              value={`${summary.devices_online} of ${summary.devices_paired}`}
              note={`${summary.devices_unpaired} not paired yet`}
            />
            <Stat label="Energy today" value={`${formatKwh(Number(summary.today_kwh))} kWh`} note="All households" />
            <Stat label={`Energy in ${month}`} value={`${formatKwh(Number(summary.month_kwh))} kWh`} note="All households" />
            <Stat
              label={`Alerts in ${month}`}
              value={String(summary.alerts_high_usage + summary.alerts_offline + (summary.alerts_unusual ?? 0))}
              note={`${summary.alerts_high_usage} high usage · ${summary.alerts_offline} offline · ${summary.alerts_unusual ?? 0} unusual`}
            />
          </View>

          <Text style={s.heading}>HOUSEHOLDS IN {month.toUpperCase()}</Text>
          <Card>
            {summary.by_household.length === 0 ? <Text style={s.muted}>No households yet.</Text> : null}
            {summary.by_household.map((h, i) => (
              <View key={h.household_id} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.rowName} numberOfLines={1}>
                    {h.household_name}
                  </Text>
                  <Text style={s.muted}>
                    {h.owner}
                    {h.account_status === 'Inactive' ? ' · deactivated' : ''} · {h.devices_online} of {h.devices} devices
                    online · {h.alerts_month} {h.alerts_month === 1 ? 'alert' : 'alerts'}
                  </Text>
                </View>
                <Text style={s.rowValue}>{formatKwh(Number(h.month_kwh))} kWh</Text>
              </View>
            ))}
          </Card>

          <Text style={s.heading}>RECENT ADMIN ACTIONS</Text>
          <Card>
            {log.length === 0 ? <Text style={s.muted}>Nothing yet.</Text> : null}
            {log.map((entry, i) => (
              <View key={entry.log_id} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{entry.action_type}</Text>
                  <Text style={s.muted}>{entry.action_details}</Text>
                </View>
                <Text style={s.muted}>
                  {new Date(entry.action_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
      <Text style={[s.muted, { marginTop: 8 }]}>Signed in as {profile?.user_email}</Text>
      <Button title="Sign out" onPress={signOut} kind="danger" />
    </Screen>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {note ? <Text style={s.muted}>{note}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { fontSize: 13, color: colors.muted },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: 2, fontVariant: ['tabular-nums'] },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  heading: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  muted: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.text },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
});
