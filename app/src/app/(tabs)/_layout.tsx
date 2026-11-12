import { Tabs } from 'expo-router/js-tabs';
import { useUnreadAlerts } from '@/lib/alerts';
import { tabIcon, useTabBarOptions } from '@/lib/tabs';
import { colors } from '@/lib/ui';

export default function TabsLayout() {
  const unread = useUnreadAlerts();
  const tabBarOptions = useTabBarOptions();
  return (
    <Tabs screenOptions={tabBarOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="appliances" options={{ title: 'Appliances', tabBarIcon: tabIcon('flash-outline') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tabIcon('stats-chart-outline') }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: tabIcon('notifications-outline'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 10 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline') }} />
    </Tabs>
  );
}
