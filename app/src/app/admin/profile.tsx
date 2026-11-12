import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Card, colors, Header, Notice, Pill, Row, Screen, SectionTitle, styles } from '@/lib/ui';

export default function AdminProfile() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const initials = `${profile.user_firstname[0] ?? ''}${profile.user_lastname[0] ?? ''}`.toUpperCase();

  return (
    <Screen>
      <Header title="Profile" admin subtitle="Account & security" />
      <Card accent>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(56,198,244,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.cyan, fontSize: 18, fontWeight: '700' }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2} numberOfLines={1}>
              {profile.user_firstname} {profile.user_lastname}
            </Text>
            <Text style={styles.small} numberOfLines={1}>
              {profile.user_email}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <Text style={[styles.small, { flex: 1 }]}>Administrator</Text>
          <Pill text="ADMIN" tone="ok" />
        </View>
      </Card>

      <SectionTitle title="Account & security" />
      <Card style={{ paddingVertical: 4 }}>
        <Row first icon="lock-closed-outline" title="Change password" onPress={() => router.push('/change-password')} />
        <Row icon="log-out-outline" tone="danger" title="Log out" onPress={signOut} />
      </Card>
      <Notice text="Admin access covers accounts, rate approvals and summary reports. Smart plugs are for monitoring only." />
    </Screen>
  );
}
