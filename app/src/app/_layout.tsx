import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
import { colors, Loading } from '@/lib/ui';

export default function RootLayout() {
  if (!isConfigured) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Not connected yet</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Copy app/.env.example to app/.env.local, fill in your Supabase URL and publishable key, then restart with:
          npx expo start -c
        </Text>
      </View>
    );
  }
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Routes />
    </AuthProvider>
  );
}

// Which screens exist depends on who is signed in. Each block below is
// reachable only while its guard is true; the app moves between them by itself.
function Routes() {
  const { loading, session, profile, household } = useAuth();
  if (loading) return <Loading />;

  const signedIn = !!session && !!profile;
  const active = signedIn && profile.account_status === 'Active';
  const admin = active && profile.user_role === 'Admin';
  const resident = active && !admin;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !active}>
        <Stack.Screen name="deactivated" options={{ title: 'ElecTrack' }} />
      </Stack.Protected>

      <Stack.Protected guard={admin}>
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={resident && !household}>
        <Stack.Screen name="onboarding" options={{ title: 'Set up your household' }} />
      </Stack.Protected>

      <Stack.Protected guard={resident && !!household}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="devices" options={{ title: 'Devices and appliances' }} />
        <Stack.Screen name="pair" options={{ title: 'Pair a device' }} />
        <Stack.Screen name="appliance" options={{ title: 'Appliance' }} />
      </Stack.Protected>
    </Stack>
  );
}
