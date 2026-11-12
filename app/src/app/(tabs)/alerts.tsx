import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAlertChanges } from '@/lib/alerts';
import { supabase } from '@/lib/supabase';
import { Button, colors, ErrorText } from '@/lib/ui';

type Alert = {
  notification_id: number;
  notification_type: string;
  notification_message: string;
  notification_isread: boolean;
  notification_timestamp: string;
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'High Usage': 'flash',
  'Device Offline': 'cloud-offline',
  'Unusual Usage': 'analytics',
};

function when(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
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

  if (!alerts) {
    return (
      <View style={s.screen}>
        <ErrorText>{error}</ErrorText>
        {error ? null : <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <FlatList
        data={alerts}
        keyExtractor={(a) => String(a.notification_id)}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            <ErrorText>{error}</ErrorText>
            {unread.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Button title={`Mark all as read (${unread.length})`} onPress={() => markRead(unread)} kind="secondary" />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <Text style={s.empty}>
            No alerts yet. You are told here when an appliance goes above its alert level, a device stops reporting, or
            a day's usage looks unusual. Set alert levels under Account, in Devices and appliances.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={s.card}
            onPress={() => markRead(item.notification_isread ? [] : [item.notification_id])}
            accessibilityLabel={`${item.notification_isread ? '' : 'Unread. '}${item.notification_type}. ${item.notification_message}`}
          >
            <View style={s.icon}>
              <Ionicons name={ICONS[item.notification_type] ?? 'notifications'} size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.top}>
                <Text style={[s.type, !item.notification_isread && s.unreadText]}>{item.notification_type}</Text>
                <Text style={s.time}>{when(item.notification_timestamp)}</Text>
              </View>
              <Text style={[s.message, !item.notification_isread && { color: colors.text }]}>
                {item.notification_message}
              </Text>
              {!item.notification_isread ? <Text style={s.newTag}>New · tap to mark as read</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  empty: { fontSize: 15, color: colors.muted, lineHeight: 22, marginTop: 8 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E4F1EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  top: { flexDirection: 'row', alignItems: 'baseline' },
  type: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  unreadText: { fontWeight: '700' },
  time: { fontSize: 12, color: colors.muted },
  message: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 2 },
  newTag: { fontSize: 12, color: colors.brand, fontWeight: '600', marginTop: 6 },
});
