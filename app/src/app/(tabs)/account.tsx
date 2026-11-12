import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, Field, Screen } from '@/lib/ui';

export default function Account() {
  const router = useRouter();
  const { profile, household, refresh, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(profile?.user_firstname ?? '');
  const [middle, setMiddle] = useState(profile?.user_middlename ?? '');
  const [last, setLast] = useState(profile?.user_lastname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  async function save() {
    setError(null);
    if (!first.trim() || !last.trim()) return setError('First and last name are required.');
    setBusy(true);
    const { error } = await supabase
      .from('users')
      .update({ user_firstname: first.trim(), user_middlename: middle.trim(), user_lastname: last.trim() })
      .eq('user_id', profile!.user_id);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await refresh();
    setBusy(false);
    setEditing(false);
  }

  const fullName = [profile.user_firstname, profile.user_middlename, profile.user_lastname].filter(Boolean).join(' ');

  return (
    <Screen edges={[]}>
      <Card>
        <Text style={s.heading}>Devices</Text>
        <Text style={s.note}>Pair a plug or power strip, name what is plugged in, and set alert levels.</Text>
        <Button title="Devices and appliances" onPress={() => router.push('/devices')} />
      </Card>

      <Card>
        <Text style={s.heading}>Your profile</Text>
        {editing ? (
          <>
            <Field label="First name" value={first} onChangeText={setFirst} maxLength={50} />
            <Field label="Middle name (optional)" value={middle} onChangeText={setMiddle} maxLength={50} />
            <Field label="Last name" value={last} onChangeText={setLast} maxLength={50} />
            <ErrorText>{error}</ErrorText>
            <Button title="Save" onPress={save} busy={busy} />
            <Button title="Cancel" onPress={() => setEditing(false)} kind="secondary" />
          </>
        ) : (
          <>
            <Line label="Name" value={fullName} />
            <Line label="Email" value={profile.user_email} />
            <Button title="Edit name" onPress={() => setEditing(true)} kind="secondary" />
          </>
        )}
      </Card>

      {household ? (
        <Card>
          <Text style={s.heading}>Household</Text>
          <Line label="Name" value={household.household_name} />
          <Line label="Property type" value={household.property_type ?? 'Not set'} />
          <Line label="People" value={household.household_size != null ? String(household.household_size) : 'Not set'} />
        </Card>
      ) : null}

      <Button title="Sign out" onPress={signOut} kind="danger" />
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginBottom: 8 },
  note: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  line: { flexDirection: 'row', paddingVertical: 8 },
  lineLabel: { width: 110, fontSize: 14, color: colors.muted },
  lineValue: { flex: 1, fontSize: 15, color: colors.text },
});
