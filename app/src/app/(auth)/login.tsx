import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, colors, ErrorText, Field, Logo, Screen, styles } from '@/lib/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Invalid email or password.' : error.message);
    // On success the app switches screens by itself (residents and admins use this same sign-in).
  }

  return (
    <Screen bottom>
      <View style={{ marginTop: 24 }}>
        <Logo />
      </View>
      <Text style={[styles.h1, { fontSize: 28, marginTop: 22 }]}>Welcome back</Text>
      <Text style={[styles.body, { marginTop: 6, marginBottom: 24 }]}>Sign in to continue monitoring your home&apos;s energy.</Text>
      <Field
        label="Email address"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} password autoComplete="password" />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={signIn} busy={busy} />
      <Text style={[styles.body, { textAlign: 'center', marginTop: 28 }]}>
        New to ElecTrack?{' '}
        <Link href="/register" style={{ color: colors.brand, fontWeight: '700' }}>
          Create account
        </Link>
      </Text>
    </Screen>
  );
}
