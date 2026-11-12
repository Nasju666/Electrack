import { useRouter } from 'expo-router';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Field, Header, Notice, Screen } from '@/lib/ui';

export default function ChangePassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (password.length < 8 || !/\d/.test(password)) return setError('Use a password of at least 8 characters with a number.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setPassword('');
    setConfirm('');
  }

  return (
    <Screen footer={done ? <Button title="Done" onPress={() => router.back()} /> : <Button title="Update password" onPress={save} busy={busy} />}>
      <Header title="Change password" subtitle="Account & security" onBack={() => router.back()} />
      {done ? (
        <Notice tone="ok" icon="checkmark-circle-outline" text="Password updated. Use the new password the next time you sign in." />
      ) : (
        <>
          <Field label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} password hint="8+ characters with a number" />
          <Field label="Confirm new password" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} password />
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Screen>
  );
}
