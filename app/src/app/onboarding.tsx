import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { formatPeso } from '@/lib/format';
import { Steps } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { Button, Card, Chips, ErrorText, Field, Header, Notice, Screen, styles } from '@/lib/ui';

const PROPERTY_TYPES = ['House', 'Apartment', 'Condominium', 'Boarding House'].map((id) => ({ id, label: id }));

export default function Onboarding() {
  const { session, profile, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile ? `${profile.user_lastname} Home` : '');
  const [propertyType, setPropertyType] = useState('House');
  const [size, setSize] = useState('');
  const [rate, setRate] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('current_rate').then(({ data }) => {
      const perKwh = (data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
      setRate(perKwh != null ? Number(perKwh) : null);
    });
  }, []);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Give your home a name.');
    const people = size.trim() ? Number(size) : null;
    if (people !== null && (!Number.isInteger(people) || people < 1 || people > 50)) {
      return setError('Household size should be a whole number, like 4.');
    }
    setBusy(true);
    const { error } = await supabase.from('household').insert({
      user_id: session!.user.id,
      household_name: name.trim(),
      property_type: propertyType,
      household_size: people,
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await refresh(); // the app moves on to the main screens
  }

  return (
    <Screen footer={<Button title="Save & continue" onPress={save} busy={busy} />}>
      <Header title="Set up your home" subtitle="Step 1 of 3" />
      <Steps done={1} />
      <Text style={[styles.h1, { marginBottom: 8 }]}>A few details for better estimates</Text>
      <Text style={[styles.body, { marginBottom: 22 }]}>
        Your household profile helps ElecTrack describe your usage. The verified electricity rate is applied
        automatically.
      </Text>
      <Field label="Home name" icon="home-outline" value={name} onChangeText={setName} maxLength={50} />
      <Text style={styles.label}>Property type</Text>
      <Chips options={PROPERTY_TYPES} value={propertyType} onChange={setPropertyType} />
      <Field label="People living here (optional)" icon="people-outline" value={size} onChangeText={setSize} keyboardType="number-pad" maxLength={2} />
      <Text style={styles.label}>Electricity rate</Text>
      <Card>
        <Text style={styles.h3}>
          {rate === undefined
            ? 'Checking the current rate…'
            : rate === null
              ? 'No approved rate yet'
              : `${formatPeso(rate)} per kWh (VECO, verified by admin)`}
        </Text>
        <Text style={[styles.small, { marginTop: 4 }]}>
          {rate === null ? 'Bill estimates appear once an administrator approves the VECO rate.' : 'Applied automatically. Amounts are in Philippine pesos.'}
        </Text>
      </Card>
      <Notice text="Estimates cover the energy charge of monitored appliances. Taxes and fixed fees on your VECO bill are not included." />
      <ErrorText>{error}</ErrorText>
      <Text style={[styles.link, { textAlign: 'center', marginTop: 4 }]} onPress={signOut}>
        Sign out
      </Text>
    </Screen>
  );
}
