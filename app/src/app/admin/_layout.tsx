import { Tabs } from 'expo-router/js-tabs';
import { tabIcon, useTabBarOptions } from '@/lib/tabs';

export default function AdminLayout() {
  const tabBarOptions = useTabBarOptions();
  return (
    <Tabs screenOptions={tabBarOptions}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="users" options={{ title: 'Users', tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen name="rates" options={{ title: 'Rate', tabBarIcon: tabIcon('cash-outline') }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: tabIcon('stats-chart-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline') }} />
    </Tabs>
  );
}
