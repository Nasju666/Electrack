import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAlertChanges } from '@/lib/alerts';
import { supabase } from '@/lib/supabase';
import { Card, Chips, colors, ErrorText, Header, IconButton, IconTile, Screen, StateCard, styles, type IconName, type Tone } from '@/lib/ui';

type Alert = {
  notification_id: number;
  notification_type: string;
  notification_message: string;
  notification_isread: boolean;
  notification_timestamp: string;
};

const LOOK: Record<string, { title: string; icon: IconName; tone: Tone }> = {
  'High Usage': { title: 'High usage detected', icon: 'warning-outline', tone: 'danger' },
  'Device Offline': { title: 'Smart plug offline', icon: 'cloud-offline-outline', tone: 'info' },
  'Unusual Usage': { title: 'Unusual usage', icon: 'analytics-outline', tone: 'warn' },
};
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'High Usage', label: 'High usage' },
  { id: 'Device Offline', label: 'Device' },
  { id: 'Unusual Usage', label: 'Unusual' },
];

function when(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const time = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (minutes < 24 * 60) return `Today, ${time}`;
  return `${new Date(iso).toLocaleDateString([], { weekday: 'long' })}, ${time}`;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notification')
      .select('notification_id, notification_type, notification_message, notification_isread, notification_timestamp')
      .order('notification_timestamp', { ascending: false })
      .limit(100);
    if (error) return setError(error.message);
    setError(null);
    setAlerts((data ?? []) as Alert[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useAlertChanges('alerts-list', load); // new alerts appear while the tab is open

  async function markRead(ids: number[]) {
    if (ids.length === 0) return;
    setAlerts((prev) => prev?.map((a) => (ids.includes(a.notification_id) ? { ...a, notification_isread: true } : a)) ?? null);
    const { error } = await supabase.from('notification').update({ notification_isread: true }).in('notification_id', ids);
    if (error) setError(error.message);
  }

  const unread = (alerts ?? []).filter((a) => !a.notification_isread).map((a) => a.notification_id);
  const shown = (alerts ?? []).filter((a) => filter === 'all' || a.notification_type === filter);

  return (
    <Screen>
      <Header
        title="Alerts"
        subtitle={alerts ? (unread.length > 0 ? `${unread.length} unread` : 'All caught up') : undefined}
        right={unread.length > 0 ? <IconButton icon="checkmark-done-outline" label="Mark all as read" onPress={() => markRead(unread)} /> : undefined}
      />
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      <ErrorText>{error}</ErrorText>

      {!alerts ? (
        error ? null : <StateCard kind="loading" title="Loading alerts" />
      ) : shown.length === 0 ? (
        <StateCard
          kind="empty"
          title={filter === 'all' ? 'No alerts yet' : 'No alerts of this kind'}
          text="You are told here when an appliance goes above its alert level, a device stops reporting, or a day's usage looks unusual."
        />
      ) : (
        shown.map((item) => {
          const look = LOOK[item.notification_type] ?? { title: item.notification_type, icon: 'notifications-outline' as IconName, tone: 'ok' as Tone };
          return (
            <Pressable
              key={item.notification_id}
              onPress={() => markRead(item.notification_isread ? [] : [item.notification_id])}
              accessibilityLabel={`${item.notification_isread ? '' : 'Unread. '}${look.title}. ${item.notification_message}`}
            >
              <Card>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IconTile icon={look.icon} tone={look.tone} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.h3, item.notification_isread && { fontWeight: '500' }]}>{look.title}</Text>
                    <Text style={[styles.small, { marginTop: 4 }, !item.notification_isread && { color: colors.text }]}>{item.notification_message}</Text>
                    <Text style={[styles.tiny, { marginTop: 6 }]}>
                      {when(item.notification_timestamp)}
                      {item.notification_isread ? '' : ' · New, tap to mark as read'}
                    </Text>
                  </View>
                  {item.notification_isread ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
      <Text style={styles.footnote}>Alerts are based on your alert levels and recent recorded patterns.</Text>
    </Screen>
  );
}
