import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LiveProvider } from '@/lib/live';
import { Splash } from '@/lib/splash';
import { isConfigured } from '@/lib/supabase';
import { colors, Loading, styles } from '@/lib/ui';
import { loadWelcomeSeen } from '@/lib/welcome';

export default function RootLayout() {
  if (!isConfigured) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={styles.h2}>Not connected yet</Text>
        <Text style={[styles.body, { marginTop: 8 }]}>
          Copy app/.env.example to app/.env.local, fill in your Supabase URL and publishable key, then restart with: npx
          expo start -c
        </Text>
      </View>
    );
  }
  return (
    <AuthProvider>
      <LiveProvider>
        <StatusBar style="light" />
        <Routes />
      </LiveProvider>
    </AuthProvider>
  );
}

// Which screens exist depends on who is signed in. Each block below is
// reachable only while its guard is true; the app moves between them by itself.
function Routes() {
  const { loading, session, profile, household } = useAuth();

  // Opening splash: stays for at least a moment so its animation can play,
  // then fades away to reveal the app underneath.
  const [played, setPlayed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [storageRead, setStorageRead] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), 2200);
    loadWelcomeSeen().then(() => setStorageRead(true));
    return () => clearTimeout(timer);
  }, []);
  const ready = played && !loading && storageRead;
  useEffect(() => {
    if (ready && !splashGone) {
      Animated.timing(splashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setSplashGone(true));
    }
  }, [ready, splashGone, splashOpacity]);

  if (loading || !storageRead) return splashGone ? <Loading /> : <Splash />;

  const signedIn = !!session && !!profile;
  const active = signedIn && profile.account_status === 'Active';
  const admin = active && profile.user_role === 'Admin';
  const resident = active && !admin;

  // Moving between areas of the app fades; opening a detail screen slides in.
  const fade = { animation: 'fade' as const };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={fade} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !active}>
        <Stack.Screen name="deactivated" options={fade} />
      </Stack.Protected>

      <Stack.Protected guard={admin}>
        <Stack.Screen name="admin" options={fade} />
        <Stack.Screen name="admin-user" />
      </Stack.Protected>

      <Stack.Protected guard={resident && !household}>
        <Stack.Screen name="onboarding" options={fade} />
      </Stack.Protected>

      <Stack.Protected guard={resident && !!household}>
        <Stack.Screen name="(tabs)" options={fade} />
        <Stack.Screen name="appliance-details" />
        <Stack.Screen name="appliance" />
        <Stack.Screen name="pair" />
        <Stack.Screen name="devices" />
        <Stack.Screen name="bill" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="coach" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="account-details" />
      </Stack.Protected>

      <Stack.Protected guard={active}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>
    </Stack>
    {splashGone ? null : (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]} pointerEvents={ready ? 'none' : 'auto'}>
        <Splash />
      </Animated.View>
    )}
    </View>
  );
}
