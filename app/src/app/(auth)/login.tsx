import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, colors, ErrorText, Field, Screen, Title } from '@/lib/ui';

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
    if (error) setError(error.message);
    // On success the app switches screens by itself.
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={{ color: colors.brand, fontWeight: '700', letterSpacing: 1, marginTop: 32, marginBottom: 8 }}>
        ELECTRACK
      </Text>
      <Title sub="Sign in to see your household's electricity use.">Welcome back</Title>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={signIn} busy={busy} />
      <Link href="/register" style={{ textAlign: 'center', marginTop: 20, color: colors.brand, fontSize: 15 }}>
        New here? Create an account
      </Link>
    </Screen>
  );
}
