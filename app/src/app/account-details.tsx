import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Chips, ErrorText, Field, Header, Screen, SectionTitle, styles } from '@/lib/ui';

const PROPERTY_TYPES = ['House', 'Apartment', 'Condominium', 'Boarding House'].map((id) => ({ id, label: id }));

export default function AccountDetails() {
  const router = useRouter();
  const { profile, household, refresh } = useAuth();
  const [first, setFirst] = useState(profile?.user_firstname ?? '');
  const [middle, setMiddle] = useState(profile?.user_middlename ?? '');
  const [last, setLast] = useState(profile?.user_lastname ?? '');
  const [home, setHome] = useState(household?.household_name ?? '');
  const [propertyType, setPropertyType] = useState(household?.property_type ?? 'House');
  const [size, setSize] = useState(household?.household_size != null ? String(household.household_size) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!first.trim() || !last.trim()) return setError('First and last name are required.');
    if (!home.trim()) return setError('Give your home a name.');
    const people = size.trim() ? Number(size) : null;
    if (people !== null && (!Number.isInteger(people) || people < 1 || people > 50)) {
      return setError('Household size should be a whole number, like 4.');
    }
    setBusy(true);
    const [user, house] = await Promise.all([
      supabase.from('users').update({ user_firstname: first.trim(), user_middlename: middle.trim(), user_lastname: last.trim() }).eq('user_id', profile!.user_id),
      supabase.from('household').update({ household_name: home.trim(), property_type: propertyType, household_size: people }).eq('household_id', household!.household_id),
    ]);
    if (user.error || house.error) {
      setBusy(false);
      return setError((user.error ?? house.error)!.message);
    }
    await refresh();
    setBusy(false);
    router.back();
  }

  return (
    <Screen footer={<Button title="Save changes" onPress={save} busy={busy} />}>
      <Header title="Account details" subtitle={profile?.user_email} onBack={() => router.back()} />
      <SectionTitle title="Your name" />
      <Field label="First name" icon="person-outline" value={first} onChangeText={setFirst} maxLength={50} />
      <Field label="Middle name (optional)" icon="person-outline" value={middle} onChangeText={setMiddle} maxLength={50} />
      <Field label="Last name" icon="person-outline" value={last} onChangeText={setLast} maxLength={50} />
      <SectionTitle title="Home details" />
      <Field label="Home name" icon="home-outline" value={home} onChangeText={setHome} maxLength={50} />
      <Text style={styles.label}>Property type</Text>
      <Chips options={PROPERTY_TYPES} value={propertyType} onChange={setPropertyType} />
      <Field label="People living here (optional)" icon="people-outline" value={size} onChangeText={setSize} keyboardType="number-pad" maxLength={2} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
