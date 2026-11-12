import { Stack } from 'expo-router';
import { useState } from 'react';
import { colors } from '@/lib/ui';
import { welcome } from '@/lib/welcome';

export default function AuthLayout() {
  // The introduction is shown once, on the first launch. Decided when this
  // layout first appears, so it stays reachable until the user leaves it.
  const [showWelcome] = useState(!welcome.seen);
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={showWelcome}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
