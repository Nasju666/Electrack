import { Link } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, colors, ErrorText, Field, Screen, Title } from '@/lib/ui';

export default function Register() {
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function register() {
    setError(null);
    if (!first.trim() || !last.trim()) return setError('Enter your first and last name.');
    if (!email.trim()) return setError('Enter your email.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

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
      <Screen edges={['top', 'bottom']}>
        <Title sub={`We sent a confirmation link to ${email.trim()}. Open it, then come back and sign in.`}>
          Check your email
        </Title>
        <Link href="/login" style={{ color: colors.brand, fontSize: 15 }}>
          Back to sign in
        </Link>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Title sub="One account per household.">Create your account</Title>
      <Field label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" />
      <Field label="Middle name (optional)" value={middle} onChangeText={setMiddle} />
      <Field label="Last name" value={last} onChangeText={setLast} autoComplete="family-name" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={register} busy={busy} />
      <Link href="/login" style={{ textAlign: 'center', marginTop: 20, color: colors.brand, fontSize: 15 }}>
        Already have an account? Sign in
      </Link>
    </Screen>
  );
}
