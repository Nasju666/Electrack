import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { LIMIT_W } from '@/lib/appliances';
import { useLive } from '@/lib/live';
import { Steps } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import type { SmartPlug } from '@/lib/types';
import { Button, Card, colors, ErrorText, Field, Header, IconTile, Pill, Screen, styles } from '@/lib/ui';

export default function Pair() {
  const router = useRouter();
  const { reload } = useLive();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [plug, setPlug] = useState<SmartPlug | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setError(null);
    if (!code.trim()) return setError('Enter the device code printed on your ElecTrack device.');
    setBusy(true);
    const { data, error } = await supabase.rpc('pair_smart_plug', { p_code: code, p_name: name || null });
    setBusy(false);
    if (error) return setError(error.message);
    setPlug(data as SmartPlug);
    reload();
  }

  const isStrip = plug?.device_type === 'Power Strip';
  const footer = plug ? (
    <Button
      title={isStrip ? 'Continue' : 'Name appliance'}
      icon="link-outline"
      onPress={() => router.replace({ pathname: '/appliance', params: { plug: String(plug.smartplug_id), paired: '1' } })}
    />
  ) : (
    <Button title="Pair device" onPress={pair} busy={busy} />
  );

  return (
    <Screen footer={footer}>
      <Header title={plug ? (isStrip ? 'Smart strip paired' : 'Smart plug paired') : 'Pair a device'} subtitle="Step 2 of 3" onBack={() => router.back()} />
      <Steps done={2} />

      <View style={{ alignItems: 'center', marginVertical: 12 }}>
        <View style={ring(200, 0.05)}>
          <View style={ring(140, 0.08)}>
            <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: colors.cardRaised, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={plug ? 'checkmark-circle-outline' : 'flash-outline'} size={34} color={colors.brand} />
            </View>
          </View>
        </View>
      </View>

      {plug ? (
        <>
          <Text style={[styles.h1, { textAlign: 'center' }]}>{isStrip ? 'Your smart strip is ready' : 'Device found'}</Text>
          <Text style={[styles.body, { textAlign: 'center', marginTop: 6, marginBottom: 18 }]}>
            Device code verified. Next, tell ElecTrack what is plugged in.
          </Text>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon="flash-outline" />
              <View style={{ flex: 1 }}>
                <Text style={styles.h3}>{plug.smartplug_name ?? plug.device_type}</Text>
                <Text style={styles.small}>{plug.smartplug_code}</Text>
              </View>
              <Pill text="PAIRED" tone="ok" />
            </View>
            <View style={styles.divider} />
            <Text style={styles.small}>
              {isStrip
                ? `Smart Power Strip · ${plug.outlet_count} outlets · up to ${LIMIT_W['Power Strip']} W per outlet · light appliances only`
                : `High-Power Smart Plug · 1 outlet · up to ${LIMIT_W['High-Power Plug'].toLocaleString('en-US')} W`}
            </Text>
          </Card>
        </>
      ) : (
        <>
          <Text style={[styles.h1, { textAlign: 'center' }]}>Enter your device code</Text>
          <Text style={[styles.body, { textAlign: 'center', marginTop: 6, marginBottom: 18 }]}>
            Plug in your ElecTrack device, then type the code printed on it.
          </Text>
          <Field
            label="Device code"
            icon="keypad-outline"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="ELT-PLUG-001"
            maxLength={50}
          />
          <Field label="Name for this device (optional)" icon="pricetag-outline" value={name} onChangeText={setName} placeholder="e.g. Bedroom plug" maxLength={40} />
          <ErrorText>{error}</ErrorText>
        </>
      )}
      <Text style={styles.footnote}>Monitoring only · ElecTrack does not control appliance power</Text>
    </Screen>
  );
}

const ring = (size: number, alpha: number) =>
  ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: `rgba(34,211,154,${alpha})`,
    borderWidth: 1,
    borderColor: 'rgba(34,211,154,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  }) as const;
