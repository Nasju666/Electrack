import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, colors, ErrorText, Field, Logo, Screen, styles } from '@/lib/ui';

/** 0-4: length, letters and numbers, mixed case, a symbol or 12+ characters. */
function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password) || password.length >= 12) score++;
  return score;
}
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export default function Register() {
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const score = strength(password);

  async function register() {
    setError(null);
    if (!first.trim() || !last.trim()) return setError('Enter your first and last name.');
    if (!email.trim()) return setError('Enter your email address.');
    if (password.length < 8 || !/\d/.test(password)) return setError('Use a password of at least 8 characters with a number.');

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Copied into the users table by the database when the account is created.
      options: { data: { first_name: first.trim(), middle_name: middle.trim(), last_name: last.trim() } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    // With email confirmation turned on, there is no session until the link is clicked.
    if (!data.session) setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <Screen bottom>
        <View style={{ marginTop: 24 }}>
          <Logo />
        </View>
        <Text style={[styles.h1, { fontSize: 28, marginTop: 22 }]}>Check your email</Text>
        <Text style={[styles.body, { marginTop: 6, marginBottom: 24 }]}>
          We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
        </Text>
        <Link href="/login" style={{ color: colors.brand, fontWeight: '700', fontSize: 15 }}>
          Back to sign in
        </Link>
      </Screen>
    );
  }

  return (
    <Screen bottom>
      <View style={{ marginTop: 8 }}>
        <Logo />
      </View>
      <Text style={[styles.h1, { fontSize: 28, marginTop: 22 }]}>Create your account</Text>
      <Text style={[styles.body, { marginTop: 6, marginBottom: 24 }]}>
        Start with your details, then set up your home and pair your first ElecTrack device.
      </Text>
      <Field label="First name" icon="person-outline" value={first} onChangeText={setFirst} autoComplete="given-name" maxLength={50} />
      <Field label="Middle name (optional)" icon="person-outline" value={middle} onChangeText={setMiddle} maxLength={50} />
      <Field label="Last name" icon="person-outline" value={last} onChangeText={setLast} autoComplete="family-name" maxLength={50} />
      <Field
        label="Email address"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} password />
      <View style={{ flexDirection: 'row', gap: 6, marginTop: -6 }}>
        {[1, 2, 3, 4].map((step) => (
          <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: score >= step ? colors.brand : colors.border }} />
        ))}
      </View>
      <Text style={[styles.tiny, { marginTop: 6, marginBottom: 14 }]}>
        {password ? `${STRENGTH[score]} · ` : ''}8+ characters with a number
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={register} busy={busy} />
      <Text style={[styles.body, { textAlign: 'center', marginTop: 24 }]}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: colors.brand, fontWeight: '700' }}>
          Sign in
        </Link>
      </Text>
    </Screen>
  );
}
