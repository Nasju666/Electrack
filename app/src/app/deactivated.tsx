import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Card, IconTile, Pill, Screen, styles } from '@/lib/ui';

export default function Deactivated() {
  const { profile, signOut } = useAuth();
  return (
    <Screen bottom>
      <View style={{ height: 120 }} />
      <Card accent style={{ padding: 22 }}>
        <IconTile icon="shield-outline" tone="warn" size={56} />
        <Text style={[styles.h1, { marginTop: 18 }]}>Account deactivated</Text>
        <Text style={[styles.body, { marginTop: 8 }]}>
          An administrator has deactivated this account, so its data is locked. Your energy history is kept.
        </Text>
        <Text style={[styles.small, { marginTop: 12, marginBottom: 12 }]}>Signed in as {profile?.user_email}</Text>
        <Pill text="Resident account" />
      </Card>
      <Button title="Back to sign in" onPress={signOut} />
      <Text style={styles.footnote}>Need access? Contact your ElecTrack administrator.</Text>
    </Screen>
  );
}
