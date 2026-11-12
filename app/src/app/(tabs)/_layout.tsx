import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useUnreadAlerts } from '@/lib/alerts';
import { colors } from '@/lib/ui';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: ColorValue | null; size: number }) => (
  <Ionicons name={name} color={(color ?? undefined) as string | undefined} size={size} />
);

export default function TabsLayout() {
  const unread = useUnreadAlerts();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('flash') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('bar-chart') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('bulb') }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: icon('notifications'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
