import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Choice, ErrorText, Field, Screen, Title } from '@/lib/ui';

const PROPERTY_TYPES = ['House', 'Apartment', 'Condominium', 'Boarding House'];

export default function Onboarding() {
  const { session, profile, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile ? `${profile.user_lastname} Household` : '');
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Give your household a name.');
    const members = size.trim() ? Number(size) : null;
    if (members !== null && (!Number.isInteger(members) || members < 1 || members > 50)) {
      return setError('Household size should be a whole number, like 4.');
    }
    setBusy(true);
    const { error } = await supabase.from('household').insert({
      user_id: session!.user.id,
      household_name: name.trim(),
      property_type: propertyType,
      household_size: members,
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await refresh(); // the app moves on to the main screens
  }

  return (
    <Screen>
      <Title sub="This is the home whose appliances ElecTrack will monitor. Costs are shown in Philippine pesos.">
        {`Hi ${profile?.user_firstname ?? ''}`.trim()}
      </Title>
      <Field label="Household name" value={name} onChangeText={setName} maxLength={50} />
      <Choice label="Property type (optional)" options={PROPERTY_TYPES} value={propertyType} onChange={setPropertyType} />
      <Field
        label="People living here (optional)"
        value={size}
        onChangeText={setSize}
        keyboardType="number-pad"
        maxLength={2}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Continue" onPress={save} busy={busy} />
      <Button title="Sign out" onPress={signOut} kind="secondary" />
    </Screen>
  );
}
