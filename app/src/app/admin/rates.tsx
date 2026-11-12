import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { dayKey, formatPeso, manilaClock } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, Field, Screen } from '@/lib/ui';

type Rate = {
  electricityrate_id: number;
  rate_per_kwh: number;
  effective_from: string;
  effective_to: string | null;
  rate_source: 'VECO Website' | 'Manual';
  verification_status: 'Pending' | 'Approved' | 'Rejected';
  source_url: string | null;
  source_note: string | null;
  approved_at: string | null;
};

const parseRate = (text: string) => {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value < 100 ? value : null;
};

export default function AdminRates() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({}); // corrected numbers for pending rates
  const [fetching, setFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newRate, setNewRate] = useState('');
  const [newFrom, setNewFrom] = useState(dayKey(manilaClock()).slice(0, 8) + '01');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [all, current] = await Promise.all([
      supabase.from('electricity_rate').select('*').order('effective_from', { ascending: false }).order('electricityrate_id', { ascending: false }),
      supabase.rpc('current_rate'),
    ]);
    if (all.error) return setError(all.error.message);
    setRates((all.data ?? []) as Rate[]);
    setCurrentId((current.data as { electricityrate_id: number | null } | null)?.electricityrate_id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function fetchFromVeco() {
    setError(null);
    setFetchMessage(null);
    setFetching(true);
    const { data, error } = await supabase.functions.invoke('fetch-veco-rate', { method: 'POST' });
    setFetching(false);
    if (error) {
      // The function's own explanation, when it sent one.
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return setError(detail?.error ?? error.message);
    }
    setFetchMessage(data?.message ?? 'Done.');
    load();
  }

  async function addManual() {
    setError(null);
    const value = parseRate(newRate);
    if (value === null) return setError('Enter the rate in pesos per kWh, like 14.96.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newFrom) || Number.isNaN(Date.parse(newFrom))) {
      return setError('Enter the start date as YYYY-MM-DD, like 2026-11-01.');
    }
    setAdding(true);
    const { error } = await supabase
      .from('electricity_rate')
      .insert({ rate_per_kwh: value, effective_from: newFrom, rate_source: 'Manual' });
    setAdding(false);
    if (error) return setError(error.message);
    setNewRate('');
    load();
  }

  function approve(rate: Rate) {
    setError(null);
    const edited = edits[rate.electricityrate_id];
    const value = edited !== undefined ? parseRate(edited) : Number(rate.rate_per_kwh);
    if (value === null) return setError('Enter the rate in pesos per kWh, like 14.96.');
    Alert.alert(
      `Approve ${formatPeso(value)} per kWh?`,
      `From ${rate.effective_from}, every household's bill estimate will use this rate.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setBusyId(rate.electricityrate_id);
            const { error } = await supabase.rpc('admin_approve_rate', {
              p_rate_id: rate.electricityrate_id,
              p_rate_per_kwh: value,
            });
            setBusyId(null);
            if (error) setError(error.message);
            load();
          },
        },
      ],
    );
  }

  async function reject(rate: Rate) {
    setBusyId(rate.electricityrate_id);
    const { error } = await supabase.rpc('admin_reject_rate', { p_rate_id: rate.electricityrate_id });
    setBusyId(null);
    if (error) setError(error.message);
    load();
  }

  if (!rates) {
    return (
      <Screen edges={[]}>
        <ErrorText>{error}</ErrorText>
        {error ? null : <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />}
      </Screen>
    );
  }

  const current = rates.find((r) => r.electricityrate_id === currentId) ?? null;
  const pending = rates.filter((r) => r.verification_status === 'Pending');
  const past = rates.filter((r) => r.verification_status !== 'Pending' && r.electricityrate_id !== currentId);

  return (
    <Screen edges={[]}>
      <Card>
        <Text style={s.caption}>RATE IN USE</Text>
        {current ? (
          <>
            <Text style={s.big}>
              {formatPeso(Number(current.rate_per_kwh))}
              <Text style={s.unit}> per kWh</Text>
            </Text>
            <Text style={s.sub}>
              Since {current.effective_from} · {current.rate_source === 'Manual' ? 'entered by hand' : 'fetched from VECO'}
            </Text>
          </>
        ) : (
          <Text style={s.sub}>None. Bill estimates stay hidden until you approve a rate.</Text>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>

      <Text style={s.heading}>WAITING FOR APPROVAL</Text>
      {pending.length === 0 ? <Text style={[s.sub, { marginBottom: 12 }]}>Nothing is waiting.</Text> : null}
      {pending.map((rate) => (
        <Card key={rate.electricityrate_id}>
          <Text style={s.sub}>
            {rate.rate_source === 'VECO Website' ? 'Fetched from the VECO website' : 'Entered by hand'} · starts{' '}
            {rate.effective_from}
          </Text>
          <Field
            label="Rate, pesos per kWh"
            value={edits[rate.electricityrate_id] ?? Number(rate.rate_per_kwh).toFixed(2)}
            onChangeText={(text) => setEdits((prev) => ({ ...prev, [rate.electricityrate_id]: text }))}
            keyboardType="decimal-pad"
            hint="Check this against the published rate. Correct it here if it is wrong."
          />
          {rate.source_note ? <Text style={s.note}>{rate.source_note}</Text> : null}
          {rate.source_url ? (
            <Button title="Open the VECO article" kind="secondary" onPress={() => Linking.openURL(rate.source_url!)} />
          ) : null}
          <Button title="Approve" onPress={() => approve(rate)} busy={busyId === rate.electricityrate_id} />
          <Button title="Reject" kind="danger" onPress={() => reject(rate)} disabled={busyId === rate.electricityrate_id} />
        </Card>
      ))}

      <Text style={s.heading}>GET A NEW RATE</Text>
      <Card>
        <Text style={s.sub}>
          Looks for the newest rate announcement in the Visayan Electric newsroom and saves the figure for you to check.
          This also runs by itself once a day.
        </Text>
        <Button title="Fetch from VECO" onPress={fetchFromVeco} busy={fetching} />
        {fetchMessage ? <Text style={[s.note, { marginTop: 10 }]}>{fetchMessage}</Text> : null}
      </Card>
      <Card>
        <Text style={[s.sub, { marginBottom: 10 }]}>Or enter the published rate yourself.</Text>
        <Field label="Rate, pesos per kWh" value={newRate} onChangeText={setNewRate} keyboardType="decimal-pad" placeholder="14.96" />
        <Field label="Starts on (YYYY-MM-DD)" value={newFrom} onChangeText={setNewFrom} autoCapitalize="none" maxLength={10} />
        <Button title="Add for approval" kind="secondary" onPress={addManual} busy={adding} />
      </Card>

      {past.length > 0 ? (
        <>
          <Text style={s.heading}>EARLIER RATES</Text>
          <Card>
            {past.map((rate, i) => (
              <View key={rate.electricityrate_id} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{formatPeso(Number(rate.rate_per_kwh))} per kWh</Text>
                  <Text style={s.sub}>
                    {rate.effective_from}
                    {rate.effective_to ? ` to ${rate.effective_to}` : ''} · {rate.rate_source === 'Manual' ? 'by hand' : 'VECO website'}
                  </Text>
                </View>
                <Text style={s.sub}>{rate.verification_status}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  caption: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  big: { fontSize: 32, fontWeight: '700', color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, fontWeight: '500', color: colors.muted },
  sub: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  note: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 4 },
  heading: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.text },
});
