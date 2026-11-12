import { useRouter } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SmartPlug } from '@/lib/types';
import { Button, ErrorText, Field, Screen, Title } from '@/lib/ui';

export default function Pair() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setError(null);
    if (!code.trim()) return setError('Enter the device code.');
    setBusy(true);
    const { data, error } = await supabase.rpc('pair_smart_plug', { p_code: code, p_name: name || null });
    setBusy(false);
    if (error) return setError(error.message);
    const plug = data as SmartPlug;
    // Straight on to naming what is plugged into outlet 1.
    router.replace({ pathname: '/appliance', params: { plug: String(plug.smartplug_id), outlet: '1' } });
  }

  return (
    <Screen>
      <Title sub="Type the code printed on your ElecTrack device, for example ELT-PLUG-001.">Pair a device</Title>
      <Field
        label="Device code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ELT-PLUG-001"
        maxLength={50}
      />
      <Field
        label="Name for this device (optional)"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Bedroom plug"
        maxLength={40}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Pair" onPress={pair} busy={busy} />
    </Screen>
  );
}
