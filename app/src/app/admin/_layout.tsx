import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { colors } from '@/lib/ui';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: ColorValue | null; size: number }) => (
  <Ionicons name={name} color={(color ?? undefined) as string | undefined} size={size} />
);

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Summary', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="users" options={{ title: 'Users', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="rates" options={{ title: 'VECO rate', tabBarIcon: icon('pricetag') }} />
    </Tabs>
  );
}
