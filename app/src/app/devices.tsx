import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { isRecent, type Appliance, type SmartPlug } from '@/lib/types';
import { Button, Card, colors, ErrorText, Screen } from '@/lib/ui';

type Plug = SmartPlug & { appliance: Appliance[] };

export default function Devices() {
  const router = useRouter();
  const [plugs, setPlugs] = useState<Plug[] | null>(null);
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

  function confirmUnpair(plug: Plug) {
    Alert.alert(
      `Unpair ${plug.smartplug_name ?? plug.smartplug_code}?`,
      'Its appliances stop being monitored. Past readings are kept. You can pair it again with the same code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('unpair_smart_plug', { p_smartplug_id: plug.smartplug_id });
            if (error) setError(error.message);
            load();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      {!plugs ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.brand} />
      ) : plugs.length === 0 ? (
        <Text style={s.empty}>
          No devices yet. Pair your ElecTrack plug or power strip using the code printed on it.
        </Text>
      ) : (
        plugs.map((plug) => {
          const online = isRecent(plug.smartplug_lastseen, now);
          const outlets = Array.from({ length: plug.outlet_count }, (_, i) => i + 1);
          return (
            <Card key={plug.smartplug_id}>
              <View style={s.plugHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.plugName}>{plug.smartplug_name ?? plug.device_type}</Text>
                  <Text style={s.sub}>
                    {plug.device_type} · {plug.smartplug_code}
                  </Text>
                </View>
                <View style={[s.badge, { backgroundColor: online ? '#DDF3E9' : '#ECEFEE' }]}>
                  <Text style={[s.badgeText, { color: online ? '#11734C' : colors.muted }]}>
                    {online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>

              {outlets.map((outlet) => {
                const appliance = plug.appliance.find((a) => a.outlet_no === outlet && a.appliance_status !== 'Removed');
                return (
                  <Pressable
                    key={outlet}
                    style={s.outlet}
                    onPress={() =>
                      router.push({
                        pathname: '/appliance',
                        params: appliance
                          ? { id: String(appliance.appliance_id) }
                          : { plug: String(plug.smartplug_id), outlet: String(outlet) },
                      })
                    }
                  >
                    <Text style={s.outletNo}>Outlet {outlet}</Text>
                    <Text style={[s.outletName, !appliance && { color: colors.brand }]} numberOfLines={1}>
                      {appliance ? appliance.appliance_name : 'Add appliance'}
                    </Text>
                    <Text style={s.chevron}>›</Text>
                  </Pressable>
                );
              })}

              <Pressable onPress={() => confirmUnpair(plug)} style={{ paddingTop: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>Unpair device</Text>
              </Pressable>
            </Card>
          );
        })
      )}
      <Button title="Pair a device" onPress={() => router.push('/pair')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 12 },
  plugHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  plugName: { fontSize: 17, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  outlet: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  outletNo: { width: 72, fontSize: 13, color: colors.muted },
  outletName: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  chevron: { fontSize: 20, color: colors.faint, paddingLeft: 8 },
});
