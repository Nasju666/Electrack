import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { prettyDate, type Rate } from '@/lib/admin';
import { dayKey, formatPeso, manilaClock } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, Field, Header, IconTile, Notice, Pill, Screen, SectionTitle, Sheet, StateCard, styles } from '@/lib/ui';

const parseRate = (text: string) => {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value < 100 ? value : null;
};

export default function AdminRates() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({}); // corrected numbers for pending rates
  const [approving, setApproving] = useState<{ rate: Rate; value: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [newFrom, setNewFrom] = useState(dayKey(manilaClock()));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [all, current] = await Promise.all([
      supabase.from('electricity_rate').select('*').order('rate_createdat', { ascending: false }),
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
    setMessage(null);
    setFetching(true);
    const { data, error } = await supabase.functions.invoke('fetch-veco-rate', { method: 'POST' });
    setFetching(false);
    if (error) {
      // The function's own explanation, when it sent one.
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return setError(detail?.error ?? error.message);
    }
    setMessage(data?.message ?? 'Done.');
    load();
  }

  async function addManual() {
    setError(null);
    const value = parseRate(newRate);
    if (value === null) return setError('Enter the rate in pesos per kWh, like 14.96.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newFrom) || Number.isNaN(Date.parse(newFrom))) {
      return setError('Enter the effective date as YYYY-MM-DD, like 2026-11-01.');
    }
    setBusy(true);
    const { error } = await supabase.from('electricity_rate').insert({ rate_per_kwh: value, effective_from: newFrom, rate_source: 'Manual' });
    setBusy(false);
    if (error) return setError(error.message);
    setNewRate('');
    setManual(false);
    setMessage('Rate added. Review and approve it below.');
    load();
  }

  function askApprove(rate: Rate) {
    setError(null);
    const edited = edits[rate.electricityrate_id];
    const value = edited !== undefined ? parseRate(edited) : Number(rate.rate_per_kwh);
    if (value === null) return setError('Enter the rate in pesos per kWh, like 14.96.');
    setApproving({ rate, value });
  }

  async function approve() {
    if (!approving) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_approve_rate', { p_rate_id: approving.rate.electricityrate_id, p_rate_per_kwh: approving.value });
    setBusy(false);
    setApproving(null);
    if (error) return setError(error.message);
    setMessage('Rate approved. Bill estimates updated.');
    load();
  }

  async function reject(rate: Rate) {
    const { error } = await supabase.rpc('admin_reject_rate', { p_rate_id: rate.electricityrate_id });
    if (error) setError(error.message);
    load();
  }

  if (!rates) {
    return (
      <Screen>
        <Header title="Verify rate" admin subtitle="VECO electricity rate review" />
        <ErrorText>{error}</ErrorText>
        {error ? null : <StateCard kind="loading" title="Loading rates" />}
      </Screen>
    );
  }

  const current = rates.find((r) => r.electricityrate_id === currentId) ?? null;
  const pending = rates.filter((r) => r.verification_status === 'Pending');
  const history = rates.filter((r) => r.verification_status !== 'Pending');
  const sourceText = (r: Rate) => (r.rate_source === 'VECO Website' ? 'Fetched from VECO website' : 'Entered manually');
  const line = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row', paddingVertical: 5 }}>
      <Text style={[styles.small, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.small, { color: color ?? colors.text, fontWeight: '600' }]}>{value}</Text>
    </View>
  );

  return (
    <Screen>
      <Header title="Verify rate" admin subtitle="VECO electricity rate review" />
      {message ? <Notice tone="ok" icon="checkmark-circle-outline" text={message} /> : null}
      <ErrorText>{error}</ErrorText>

      {pending.map((rate) => (
        <Card accent key={rate.electricityrate_id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.caps, { flex: 1 }]}>Pending rate review</Text>
            <Pill text="Pending" tone="warn" />
          </View>
          <Field
            label="Rate, pesos per kWh"
            icon="cash-outline"
            value={edits[rate.electricityrate_id] ?? Number(rate.rate_per_kwh).toFixed(2)}
            onChangeText={(text) => setEdits((prev) => ({ ...prev, [rate.electricityrate_id]: text }))}
            keyboardType="decimal-pad"
            hint="Check this against the published rate. Correct it here if it is wrong."
          />
          {line('Effective from', prettyDate(rate.effective_from))}
          {line('Source', sourceText(rate))}
          {line('Approved by', '— Not yet approved', colors.amber)}
          {rate.source_note ? <Text style={[styles.small, { marginTop: 8 }]}>{rate.source_note}</Text> : null}
          {rate.source_url ? <Button title="Open the VECO article" kind="secondary" icon="open-outline" onPress={() => Linking.openURL(rate.source_url!)} /> : null}
          <Button title="Approve rate" onPress={() => askApprove(rate)} />
          <Text style={[styles.link, { color: colors.danger, textAlign: 'center', marginTop: 14 }]} onPress={() => reject(rate)}>
            Reject this rate
          </Text>
        </Card>
      ))}

      <Card accent={pending.length === 0}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.h3, { flex: 1 }]}>Current approved rate</Text>
          {current ? <Pill text="In use" tone="ok" /> : <Pill text="None" tone="danger" />}
        </View>
        {current ? (
          <>
            <Text style={[styles.big, { marginTop: 8 }]}>
              {formatPeso(Number(current.rate_per_kwh))}
              <Text style={styles.unit}> / kWh</Text>
            </Text>
            <Text style={[styles.small, { marginTop: 6 }]}>
              Effective {prettyDate(current.effective_from)} · {sourceText(current)}
            </Text>
          </>
        ) : (
          <Text style={[styles.small, { marginTop: 8 }]}>Bill estimates stay hidden until you approve a rate.</Text>
        )}
      </Card>

      {pending.length > 0 ? (
        <Notice tone="warn" text="Pending rates are not used for estimates. The current approved rate remains in use." />
      ) : (
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <IconTile icon="document-text-outline" size={52} />
          <Text style={[styles.h2, { marginTop: 14 }]}>All caught up</Text>
          <Text style={[styles.body, { textAlign: 'center', marginTop: 6 }]}>
            No rate is waiting for review. ElecTrack checks the VECO newsroom once a day; you can also check now.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button title="Fetch from VECO" icon="cloud-download-outline" onPress={fetchFromVeco} busy={fetching} />
            <Button title="Enter rate manually" kind="secondary" onPress={() => setManual(true)} />
          </View>
        </Card>
      )}

      <SectionTitle title="Rate history" />
      {history.length === 0 ? <Text style={styles.body}>No approved or rejected rates yet.</Text> : null}
      {history.map((rate) => (
        <Card key={rate.electricityrate_id}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={[styles.h3, { flex: 1 }]}>
              {prettyDate(rate.effective_from)}
              {rate.effective_to ? ` – ${prettyDate(rate.effective_to)}` : ''}
            </Text>
            <Text style={styles.h2}>
              {formatPeso(Number(rate.rate_per_kwh))}
              <Text style={styles.tiny}> / kWh</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <Pill text={rate.rate_source === 'VECO Website' ? 'Fetched' : 'Manual'} tone="info" />
            <Pill text={rate.verification_status} tone={rate.verification_status === 'Approved' ? 'ok' : 'danger'} />
            {rate.electricityrate_id === currentId ? <Pill text="In use" tone="ok" /> : null}
          </View>
          {rate.approved_at ? <Text style={[styles.tiny, { marginTop: 8 }]}>Approved {prettyDate(rate.approved_at)}</Text> : null}
        </Card>
      ))}
      <Text style={styles.footnote}>Only approved rates are used in bill estimates.</Text>

      <Sheet visible={manual} onClose={() => setManual(false)}>
        <Text style={styles.h1}>Enter rate manually</Text>
        <Text style={[styles.small, { marginTop: 4, marginBottom: 14 }]}>Enter a verified VECO rate. It is saved as pending for you to approve.</Text>
        <Field label="Rate (₱/kWh)" icon="cash-outline" value={newRate} onChangeText={setNewRate} keyboardType="decimal-pad" placeholder="14.96" />
        <Field label="Effective date (YYYY-MM-DD)" icon="calendar-outline" value={newFrom} onChangeText={setNewFrom} autoCapitalize="none" maxLength={10} />
        <Button title="Save" onPress={addManual} busy={busy} />
        <Button title="Cancel" kind="secondary" onPress={() => setManual(false)} />
      </Sheet>

      <Sheet visible={!!approving} onClose={() => setApproving(null)}>
        <Text style={styles.h1}>Approve {approving ? formatPeso(approving.value) : ''} per kWh?</Text>
        <Text style={[styles.body, { marginTop: 8, marginBottom: 8 }]}>
          It becomes the rate in use right away, and every household&apos;s bill estimate will use it. The previous rate is retired.
        </Text>
        <Button title="Approve rate" onPress={approve} busy={busy} />
        <Button title="Cancel" kind="secondary" onPress={() => setApproving(null)} />
      </Sheet>
    </Screen>
  );
}
