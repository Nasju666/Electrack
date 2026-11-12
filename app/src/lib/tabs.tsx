import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { colors, type IconName } from './ui';

/** Shared look for the resident and admin tab bars. Height and safe-area padding are left to the navigator. */
export function useTabBarOptions() {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: '#0A1626', borderTopColor: colors.border },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600' as const },
    sceneStyle: { backgroundColor: colors.bg },
  };
}

export const tabIcon = (name: IconName) => ({ color, size }: { color: ColorValue | null; size: number }) => (
  <Ionicons name={name} color={(color ?? undefined) as string | undefined} size={size - 2} />
);
