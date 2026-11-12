import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { prettyDate, type Summary } from '@/lib/admin';
import { formatKwh, formatPeso, manilaClock, MONTHS } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { isRecent, type Profile, type SmartPlug } from '@/lib/types';
import { Button, Card, colors, ErrorText, Header, IconTile, Pill, Screen, SectionTitle, Sheet, Stat, StateCard, styles } from '@/lib/ui';

type UserRow = Profile & { user_createdat: string; household: { household_id: number; household_name: string }[] | { household_id: number; household_name: string } | null };

export default function AdminUser() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<UserRow | null>(null);
  const [plugs, setPlugs] = useState<SmartPlug[]>([]);
  const [monthKwh, setMonthKwh] = useState(0);
  const [rate, setRate] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('users').select('*, household(household_id, household_name)').eq('user_id', id).single();
    if (error) return setError(error.message);
    const row = data as unknown as UserRow;
    setUser(row);
    const home = Array.isArray(row.household) ? row.household[0] : row.household;
    if (!home) return;
    const [devices, summary, current] = await Promise.all([
      supabase.from('smart_plug').select('*').eq('household_id', home.household_id).order('smartplug_id'),
      supabase.rpc('admin_summary'),
      supabase.rpc('current_rate'),
    ]);
    setPlugs((devices.data ?? []) as SmartPlug[]);
    setMonthKwh(Number((summary.data as Summary | null)?.by_household.find((h) => h.household_id === home.household_id)?.month_kwh ?? 0));
    const perKwh = (current.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
    setRate(perKwh != null ? Number(perKwh) : null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <Screen bottom>
        <Header title="User details" admin onBack={() => router.back()} />
        <ErrorText>{error}</ErrorText>
        {error ? null : <StateCard kind="loading" title="Loading account" />}
      </Screen>
    );
  }

  const active = user.account_status === 'Active';
  const home = Array.isArray(user.household) ? user.household[0] : user.household;
  const name = `${user.user_firstname} ${user.user_lastname}`;
  const now = Date.now();
  const online = plugs.filter((p) => isRecent(p.smartplug_lastseen, now)).length;
  const clock = manilaClock();

  async function setStatus() {
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_account_status', { p_user_id: user!.user_id, p_status: active ? 'Inactive' : 'Active' });
    setBusy(false);
    setConfirming(false);
    if (error) return setError(error.message);
    load();
  }

  return (
    <Screen bottom>
      <Header title="User details" admin subtitle="Account & household monitoring" onBack={() => router.back()} />
      <ErrorText>{error}</ErrorText>

      <Card accent>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(56,198,244,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.cyan, fontSize: 16, fontWeight: '700' }}>{`${user.user_firstname[0] ?? ''}${user.user_lastname[0] ?? ''}`.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.small} numberOfLines={1}>
              {user.user_email}
            </Text>
          </View>
          <Pill text={active ? 'Active' : 'Deactivated'} tone={active ? 'ok' : 'danger'} />
        </View>
        <View style={styles.divider} />
        <Text style={styles.small}>
          {home ? `${home.household_name} · ${plugs.length} ${plugs.length === 1 ? 'plug' : 'plugs'}` : 'No household set up yet'} · joined {prettyDate(user.user_createdat)}
        </Text>
      </Card>

      {home ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.caps, { flex: 1 }]}>
                {MONTHS[clock.getUTCMonth()]} {clock.getUTCFullYear()} · to date
              </Text>
              <Text style={[styles.small, { color: colors.brand }]}>Approved rate</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Monthly consumption" value={`${formatKwh(monthKwh)} kWh`} note="Monitored appliances" />
              <Stat label="Est. energy charge" value={rate !== null ? formatPeso(monthKwh * rate) : '—'} valueColor={colors.cyan} note={rate !== null ? `Energy only · ${formatPeso(rate)}/kWh` : 'No approved rate'} />
            </View>
          </Card>

          <SectionTitle title="Smart plugs" action={plugs.length ? `${online} online · ${plugs.length - online} offline` : undefined} onAction={() => {}} />
          {plugs.length === 0 ? <Text style={[styles.body, { marginBottom: 12 }]}>No devices paired.</Text> : null}
          {plugs.map((p) => {
            const isOnline = isRecent(p.smartplug_lastseen, now);
            return (
              <Card key={p.smartplug_id} style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <IconTile icon="flash-outline" tone="info" size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h3}>{p.smartplug_name ?? p.device_type}</Text>
                    <Text style={styles.tiny}>
                      {p.smartplug_code} · last seen {p.smartplug_lastseen ? (isOnline ? 'just now' : prettyDate(p.smartplug_lastseen)) : 'never'}
                    </Text>
                  </View>
                  <Pill text={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'ok' : 'muted'} />
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      <Button title={active ? 'Deactivate account' : 'Reactivate account'} kind={active ? 'danger' : 'primary'} onPress={() => setConfirming(true)} />
      <Text style={styles.footnote}>
        {active ? 'Deactivation blocks access to household data and retains energy history.' : 'Access is blocked. Energy history is retained.'}
      </Text>

      <Sheet visible={confirming} onClose={() => setConfirming(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <IconTile icon={active ? 'person-remove-outline' : 'person-add-outline'} tone={active ? 'danger' : 'ok'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>{active ? 'Deactivate account?' : 'Reactivate account?'}</Text>
            <Text style={styles.small}>
              {name}
              {home ? ` · ${home.household_name}` : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.body}>
          {active
            ? `${user.user_firstname} will be locked out of their household data. The household and its energy history are retained, and you can reactivate the account later.`
            : `${user.user_firstname} can sign in and view their household's energy data again. Existing records remain available.`}
        </Text>
        <Text style={[styles.small, { marginTop: 10, marginBottom: 6 }]}>This changes account access only, not power to any device.</Text>
        <Button title={active ? 'Deactivate account' : 'Reactivate account'} kind={active ? 'danger' : 'primary'} onPress={setStatus} busy={busy} />
        <Button title="Cancel" kind="secondary" onPress={() => setConfirming(false)} />
      </Sheet>
    </Screen>
  );
}
