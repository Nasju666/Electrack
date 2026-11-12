import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { lookOf } from '@/lib/appliances';
import { formatKw, formatKwh, formatPeso } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { fetchUsage, sumBy, type UsageRow } from '@/lib/usage';
import { Card, Chips, colors, ErrorText, Header, IconButton, IconTile, Notice, Pill, Screen, Stat, StateCard, styles } from '@/lib/ui';

type Filter = 'all' | 'online' | 'offline';

export default function Appliances() {
  const router = useRouter();
  const live = useLive();
  const [today, setToday] = useState<UsageRow[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      live.reload();
      (async () => {
        try {
          const [usage, currentRate] = await Promise.all([fetchUsage(0, 'day'), supabase.rpc('current_rate')]);
          setToday(usage);
          const perKwh = (currentRate.data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
          setRate(perKwh != null ? Number(perKwh) : null);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const all = live.appliances ?? [];
  const kwhOf = sumBy(today, (r) => r.appliance_id);
  const shown = all.filter((a) => filter === 'all' || (filter === 'online') === (live.watts(a.appliance_id) !== null));
  const offline = all.length - live.onlineCount;

  return (
    <Screen>
      <Header
        title="Appliances"
        subtitle={live.appliances ? `${all.length} monitored · ${live.onlineCount} online` : undefined}
        right={<IconButton icon="add" label="Add a device or appliance" onPress={() => router.push('/devices')} />}
      />
      <ErrorText>{error ?? live.error}</ErrorText>

      {live.appliances === null ? (
        <StateCard kind="loading" title="Loading your appliances" />
      ) : all.length === 0 ? (
        <StateCard
          kind="empty"
          title="No appliances yet"
          text="Pair an ElecTrack device, then tell the app what is plugged into it."
          action="Pair a smart plug"
          onAction={() => router.push('/pair')}
        />
      ) : (
        <>
          <Chips
            options={[
              { id: 'all', label: `All ${all.length}` },
              { id: 'online', label: `Online ${live.onlineCount}` },
              { id: 'offline', label: `Offline ${offline}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Notice icon="speedometer-outline" text={`Your connected appliances are drawing ${formatKw(live.totalWatts)} right now.`} />

          {shown.length === 0 ? <Text style={[styles.body, { marginTop: 8 }]}>No appliances are {filter} right now.</Text> : null}
          {shown.map((a) => {
            const watts = live.watts(a.appliance_id);
            const online = watts !== null;
            const kwh = kwhOf[a.appliance_id] ?? 0;
            const look = lookOf(a.appliance_category);
            return (
              <Card key={a.appliance_id} onPress={() => router.push({ pathname: '/appliance-details', params: { id: String(a.appliance_id) } })}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IconTile icon={look.icon} tone={look.tone} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h3} numberOfLines={1}>
                      {a.appliance_name}
                    </Text>
                    <View style={{ marginTop: 6 }}>
                      <Pill text={online ? 'ONLINE' : 'OFFLINE'} tone={online ? 'ok' : 'muted'} icon={online ? 'wifi' : 'cloud-offline-outline'} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.h2, !online && { color: colors.muted }]}>{online ? formatKw(watts) : '0 W'}</Text>
                    <Text style={styles.tiny}>current</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={{ flexDirection: 'row' }}>
                  <Stat label="Today" value={`${formatKwh(kwh)} kWh`} />
                  <Stat label="Est. cost" value={rate !== null ? formatPeso(kwh * rate) : '—'} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>
                    {a.smart_plug?.smartplug_name ?? a.smart_plug?.device_type} · outlet {a.outlet_no}
                    {a.appliance_location ? ` · ${a.appliance_location}` : ''}
                  </Text>
                  <Text style={styles.link}>View details</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand} />
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
