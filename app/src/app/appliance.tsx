import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CATEGORIES, LIMIT_W, looksHeavy } from '@/lib/appliances';
import { useAuth } from '@/lib/auth';
import { useLive } from '@/lib/live';
import { Steps } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import type { Appliance, SmartPlug } from '@/lib/types';
import { Button, Card, colors, ErrorText, Field, Header, IconTile, Loading, Pill, Screen, Sheet, styles, TileChoice } from '@/lib/ui';

/**
 * Add an appliance (params: plug, optional outlet, optional paired=1 when arriving
 * straight from pairing) or edit one (param: id).
 */
export default function ApplianceForm() {
  const router = useRouter();
  const { household } = useAuth();
  const { reload } = useLive();
  const params = useLocalSearchParams<{ id?: string; plug?: string; outlet?: string; paired?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const justPaired = params.paired === '1';

  const [plug, setPlug] = useState<SmartPlug | null>(null);
  const [taken, setTaken] = useState<Record<number, string>>({}); // outlet -> appliance already there
  const [outlet, setOutlet] = useState<number | null>(params.outlet ? Number(params.outlet) : null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [threshold, setThreshold] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let plugId = params.plug ? Number(params.plug) : null;
      if (editingId) {
        const { data, error } = await supabase.from('appliance').select('*').eq('appliance_id', editingId).single();
        if (error) return setError(error.message);
        const a = data as Appliance;
        plugId = a.smartplug_id;
        setOutlet(a.outlet_no);
        setName(a.appliance_name);
        setCategory(a.appliance_category);
        setLocation(a.appliance_location ?? '');
        setThreshold(a.usage_threshold_w != null ? String(Number(a.usage_threshold_w)) : '');
      }
      const [p, others] = await Promise.all([
        supabase.from('smart_plug').select('*').eq('smartplug_id', plugId!).single(),
        supabase.from('appliance').select('outlet_no, appliance_name').eq('smartplug_id', plugId!).eq('appliance_status', 'Active'),
      ]);
      if (p.error) return setError(p.error.message);
      const device = p.data as SmartPlug;
      const inUse: Record<number, string> = {};
      for (const o of (others.data ?? []) as { outlet_no: number; appliance_name: string }[]) inUse[o.outlet_no] = o.appliance_name;
      setPlug(device);
      setTaken(inUse);
      // Pick the outlet when there is no choice to make.
      if (!editingId && !params.outlet) {
        const free = Array.from({ length: device.outlet_count }, (_, i) => i + 1).filter((n) => !inUse[n]);
        if (device.outlet_count === 1 || free.length === 1) setOutlet(free[0] ?? 1);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function done() {
    reload();
    if (router.canGoBack()) router.back();
    else router.replace('/devices');
  }

  if (!ready) {
    return error ? (
      <Screen bottom>
        <Header title="Appliance" onBack={() => router.back()} />
        <ErrorText>{error}</ErrorText>
      </Screen>
    ) : (
      <Loading />
    );
  }

  const device = plug!;
  const isStrip = device.device_type === 'Power Strip';
  const limit = LIMIT_W[device.device_type];
  const tooHeavy = isStrip && looksHeavy(name);
  const allTaken = !editingId && Object.keys(taken).length >= device.outlet_count;

  async function save() {
    setError(null);
    if (outlet === null) return setError('Choose which outlet the appliance is plugged into.');
    if (!name.trim()) return setError('Give the appliance a name.');
    const watts = threshold.trim() ? Number(threshold) : null;
    if (watts !== null && (!Number.isFinite(watts) || watts <= 0)) {
      return setError('The alert level should be a number of watts, like 1200.');
    }
    const fields = {
      appliance_name: name.trim(),
      appliance_category: category,
      appliance_location: location.trim() || null,
      usage_threshold_w: watts,
    };
    setBusy(true);
    const { error } = editingId
      ? await supabase.from('appliance').update(fields).eq('appliance_id', editingId)
      : await supabase.from('appliance').insert({
          ...fields,
          household_id: household!.household_id,
          smartplug_id: device.smartplug_id,
          outlet_no: outlet,
        });
    setBusy(false);
    if (error) return setError(error.message);
    done();
  }

  async function remove() {
    setConfirmRemove(false);
    const { error } = await supabase.from('appliance').update({ appliance_status: 'Removed' }).eq('appliance_id', editingId!);
    if (error) return setError(error.message);
    reload();
    router.dismissTo('/devices');
  }

  return (
    <Screen
      footer={
        <>
          <Button title={editingId ? 'Save changes' : 'Finish setup'} onPress={save} busy={busy} disabled={tooHeavy || allTaken} />
          <Text style={[styles.footnote, { marginTop: 8 }]}>Monitoring only · ElecTrack does not control appliance power</Text>
        </>
      }
    >
      <Header
        title={editingId ? 'Edit appliance' : 'Name appliance'}
        subtitle={editingId ? `${device.smartplug_name ?? device.device_type} · outlet ${outlet}` : 'Step 3 of 3'}
        onBack={() => router.back()}
      />
      {editingId ? null : <Steps done={3} />}

      {justPaired ? (
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <IconTile icon="checkmark-circle-outline" size={52} />
          <Text style={[styles.h1, { marginTop: 12, textAlign: 'center' }]}>{isStrip ? 'Strip' : 'Plug'} paired successfully</Text>
          <Text style={[styles.body, { textAlign: 'center', marginTop: 4 }]}>
            Choose what is connected so your insights stay easy to understand.
          </Text>
        </View>
      ) : null}

      <Pill text={isStrip ? `Smart Power Strip · up to ${limit} W per outlet` : `High-Power Smart Plug · up to ${limit.toLocaleString('en-US')} W`} tone="ok" icon="pricetag-outline" />
      <View style={{ height: 16 }} />

      {isStrip && !editingId ? (
        <>
          <Text style={styles.label}>Which outlet is the appliance plugged into?</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {Array.from({ length: device.outlet_count }, (_, i) => i + 1).map((n) => {
              const inUse = taken[n];
              const on = outlet === n;
              return (
                <Pressable
                  key={n}
                  disabled={!!inUse}
                  onPress={() => setOutlet(n)}
                  style={[styles.tile, { maxWidth: undefined, width: undefined, flex: 1 }, on && styles.tileOn, !!inUse && { opacity: 0.5 }]}
                >
                  <Ionicons name={inUse ? 'lock-closed-outline' : on ? 'checkmark-circle-outline' : 'ellipse-outline'} size={18} color={on ? colors.brand : colors.sub} />
                  <Text style={[styles.h3, on && { color: colors.brand }]}>Outlet {n}</Text>
                  <Text style={[styles.tiny, { paddingHorizontal: 6 }]} numberOfLines={1}>
                    {inUse ? `In use · ${inUse}` : on ? 'Selected' : 'Available'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {allTaken ? <ErrorText>Every outlet on this strip already has an appliance. Remove one first.</ErrorText> : null}
        </>
      ) : null}

      <Field label="Appliance name" icon="pricetag-outline" value={name} onChangeText={setName} placeholder={isStrip ? 'e.g. Living room TV' : 'e.g. Bedroom aircon'} maxLength={50} />

      {tooHeavy ? (
        <Card style={{ borderColor: colors.amber, backgroundColor: 'rgba(245,181,68,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Ionicons name="warning-outline" size={20} color={colors.amber} />
            <Text style={[styles.h3, { color: colors.amber, flex: 1 }]}>This appliance needs the High-Power Smart Plug.</Text>
          </View>
          <Text style={styles.small}>
            Strip outlets are validated for light appliances up to {limit} W. Plug this one into the High-Power Smart
            Plug, or name the light appliance that is actually connected here.
          </Text>
        </Card>
      ) : null}

      <Text style={styles.label}>Select a category</Text>
      <TileChoice options={[...CATEGORIES[device.device_type]]} value={category} onChange={setCategory} />

      <Field label="Room or location (optional)" icon="location-outline" value={location} onChangeText={setLocation} placeholder="e.g. Living room" maxLength={50} />
      <Field
        label="High-usage alert level, in watts (optional)"
        icon="notifications-outline"
        value={threshold}
        onChangeText={setThreshold}
        keyboardType="numeric"
        placeholder={String(limit)}
        hint="You get an alert when this appliance stays above this level."
      />
      <ErrorText>{error}</ErrorText>
      {editingId ? (
        <Text style={[styles.link, { color: colors.danger, textAlign: 'center', marginTop: 8 }]} onPress={() => setConfirmRemove(true)}>
          Remove appliance
        </Text>
      ) : null}

      <Sheet visible={confirmRemove} onClose={() => setConfirmRemove(false)}>
        <Text style={styles.h1}>Remove {name}?</Text>
        <Text style={[styles.body, { marginTop: 8, marginBottom: 8 }]}>
          Monitoring stops for this outlet until you add an appliance again. Past readings are kept.
        </Text>
        <Button title="Remove appliance" kind="danger" onPress={remove} />
        <Button title="Cancel" kind="secondary" onPress={() => setConfirmRemove(false)} />
      </Sheet>
    </Screen>
  );
}
