import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Appliance, SmartPlug } from '@/lib/types';
import { Button, Choice, colors, ErrorText, Field, Loading, Screen, Title } from '@/lib/ui';

const CATEGORIES = [
  'Air Conditioner',
  'Refrigerator',
  'Television',
  'Electric Fan',
  'Rice Cooker',
  'Microwave Oven',
  'Computer / Laptop',
  'Other',
];

// The validated limits from the approved scope.
const LIMIT_W = { 'High-Power Plug': 1760, 'Power Strip': 150 } as const;

/**
 * Add an appliance to an outlet (params: plug, outlet) or edit one (param: id).
 */
export default function ApplianceForm() {
  const router = useRouter();
  const { household } = useAuth();
  const params = useLocalSearchParams<{ id?: string; plug?: string; outlet?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const [plug, setPlug] = useState<SmartPlug | null>(null);
  const [outlet, setOutlet] = useState<number>(Number(params.outlet ?? 1));
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [threshold, setThreshold] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
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
      const { data: p, error: plugError } = await supabase
        .from('smart_plug')
        .select('*')
        .eq('smartplug_id', plugId!)
        .single();
      if (plugError) return setError(plugError.message);
      setPlug(p as SmartPlug);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limit = plug ? LIMIT_W[plug.device_type] : 0;

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/devices');
  }

  async function save() {
    setError(null);
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
          smartplug_id: plug!.smartplug_id,
          outlet_no: outlet,
        });
    setBusy(false);
    if (error) return setError(error.message);
    done();
  }

  function confirmRemove() {
    Alert.alert(`Remove ${name}?`, 'Monitoring stops for this outlet until you add an appliance again. Past readings are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('appliance')
            .update({ appliance_status: 'Removed' })
            .eq('appliance_id', editingId!);
          if (error) return setError(error.message);
          done();
        },
      },
    ]);
  }

  if (!ready) {
    return error ? (
      <Screen>
        <ErrorText>{error}</ErrorText>
      </Screen>
    ) : (
      <Loading />
    );
  }

  return (
    <Screen>
      <Title sub={`${plug!.smartplug_name ?? plug!.device_type} · outlet ${outlet}`}>
        {editingId ? 'Edit appliance' : 'What is plugged in?'}
      </Title>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
        {plug!.device_type === 'High-Power Plug'
          ? `This plug is validated for one appliance up to about ${limit.toLocaleString('en-US')} W (for example an aircon up to 1.5 HP). Do not connect anything larger.`
          : `Each outlet of this strip is for a light appliance up to ${limit} W. Do not connect heaters, kettles or other high-wattage appliances.`}
      </Text>
      <Field label="Appliance name" value={name} onChangeText={setName} placeholder="e.g. Bedroom aircon" maxLength={50} />
      <Choice label="Category (optional)" options={CATEGORIES} value={category} onChange={setCategory} />
      <Field
        label="Room or location (optional)"
        value={location}
        onChangeText={setLocation}
        placeholder="e.g. Living room"
        maxLength={50}
      />
      <Field
        label="High-usage alert level, in watts (optional)"
        value={threshold}
        onChangeText={setThreshold}
        keyboardType="numeric"
        placeholder={String(limit)}
        hint="You get an alert when this appliance draws more than this."
      />
      <ErrorText>{error}</ErrorText>
      <Button title={editingId ? 'Save changes' : 'Add appliance'} onPress={save} busy={busy} />
      {editingId ? <Button title="Remove appliance" onPress={confirmRemove} kind="danger" /> : null}
    </Screen>
  );
}
