import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LIMIT_W } from '@/lib/appliances';
import { formatKw } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { isRecent, type Appliance, type SmartPlug } from '@/lib/types';
import { Button, Card, colors, ErrorText, Header, IconButton, IconTile, Pill, Screen, Sheet, StateCard, styles } from '@/lib/ui';

type Plug = SmartPlug & { appliance: Appliance[] };

export default function Devices() {
  const router = useRouter();
  const live = useLive();
  const [plugs, setPlugs] = useState<Plug[] | null>(null);
  const [unpairing, setUnpairing] = useState<Plug | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('smart_plug').select('*, appliance(*)').order('smartplug_id');
    if (error) return setError(error.message);
    setError(null);
    setPlugs((data ?? []) as unknown as Plug[]);
    setNow(Date.now());
  }, []);

  // Reload on every visit, and every 15 s while open so Online/Offline stays true.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15_000);
      return () => clearInterval(timer);
    }, [load]),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function unpair(plug: Plug) {
    setUnpairing(null);
    const { error } = await supabase.rpc('unpair_smart_plug', { p_smartplug_id: plug.smartplug_id });
    if (error) setError(error.message);
    live.reload();
    load();
  }

  const online = (plugs ?? []).filter((p) => isRecent(p.smartplug_lastseen, now)).length;

  return (
    <Screen bottom>
      <Header
        title="Connected devices"
        subtitle={plugs ? `${plugs.length} paired · ${online} online` : undefined}
        onBack={() => router.back()}
        right={<IconButton icon="add" label="Pair a device" onPress={() => router.push('/pair')} />}
      />
      <ErrorText>{error}</ErrorText>

      {!plugs ? (
        error ? null : <StateCard kind="loading" title="Loading your devices" />
      ) : plugs.length === 0 ? (
        <StateCard
          kind="empty"
          title="No devices yet"
          text="Pair your ElecTrack plug or power strip using the code printed on it."
          action="Pair a smart plug"
          onAction={() => router.push('/pair')}
        />
      ) : (
        plugs.map((plug) => {
          const isOnline = isRecent(plug.smartplug_lastseen, now);
          const isStrip = plug.device_type === 'Power Strip';
          const outlets = Array.from({ length: plug.outlet_count }, (_, i) => i + 1);
          return (
            <Card key={plug.smartplug_id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon="flash-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.h3}>{plug.smartplug_name ?? plug.device_type}</Text>
                  <Text style={styles.small}>
                    {isStrip ? `${plug.outlet_count} outlets · limit ${LIMIT_W['Power Strip']} W/outlet` : `1 appliance · limit ${LIMIT_W['High-Power Plug'].toLocaleString('en-US')} W`}
                  </Text>
                </View>
                <Pill text={isOnline ? 'ONLINE' : 'OFFLINE'} tone={isOnline ? 'ok' : 'muted'} icon={isOnline ? 'wifi' : 'cloud-offline-outline'} />
              </View>
              <View style={{ height: 8 }} />
              {outlets.map((outlet) => {
                const appliance = plug.appliance.find((a) => a.outlet_no === outlet && a.appliance_status === 'Active');
                const watts = appliance ? live.watts(appliance.appliance_id) : null;
                return (
                  <Pressable
                    key={outlet}
                    style={[styles.row, styles.rowBorder]}
                    onPress={() =>
                      router.push({
                        pathname: '/appliance',
                        params: appliance ? { id: String(appliance.appliance_id) } : { plug: String(plug.smartplug_id), outlet: String(outlet) },
                      })
                    }
                  >
                    <Ionicons name="radio-outline" size={16} color={colors.cyan} />
                    <Text style={[styles.small, { width: 62 }]}>Outlet {outlet}</Text>
                    <Text style={[styles.rowTitle, !appliance && { color: colors.brand }]} numberOfLines={1}>
                      {appliance ? appliance.appliance_name : 'Add appliance'}
                    </Text>
                    {appliance ? <Text style={[styles.small, { color: watts !== null ? colors.brand : colors.muted }]}>{watts !== null ? formatKw(watts) : '—'}</Text> : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Pressable>
                );
              })}
              <View style={[styles.rowBorder, { paddingTop: 12 }]}>
                <Text style={styles.tiny}>Device code {plug.smartplug_code}</Text>
                <Text style={[styles.link, { color: colors.danger, marginTop: 8 }]} onPress={() => setUnpairing(plug)}>
                  Unpair device
                </Text>
              </View>
            </Card>
          );
        })
      )}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Ionicons name="help-circle-outline" size={18} color={colors.cyan} />
          <Text style={styles.h3}>Having connection trouble?</Text>
        </View>
        <Text style={styles.small}>
          Keep the device within Wi-Fi range and check that your home network is available. A device shows Offline
          after 90 seconds without a reading.
        </Text>
      </Card>
      <Text style={styles.footnote}>Smart plugs report energy data only. No remote power control.</Text>

      <Sheet visible={!!unpairing} onClose={() => setUnpairing(null)}>
        <Text style={styles.h1}>Unpair {unpairing?.smartplug_name ?? unpairing?.device_type}?</Text>
        <Text style={[styles.body, { marginTop: 8, marginBottom: 8 }]}>
          Its appliances stop being monitored. Past readings are kept, and you can pair it again with the same code.
        </Text>
        <Button title="Unpair device" kind="danger" onPress={() => unpairing && unpair(unpairing)} />
        <Button title="Cancel" kind="secondary" onPress={() => setUnpairing(null)} />
      </Sheet>
    </Screen>
  );
}
