import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { formatPeso } from '@/lib/format';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { Card, colors, Header, Pill, Row, Screen, SectionTitle, styles } from '@/lib/ui';

export default function Profile() {
  const router = useRouter();
  const { profile, household, signOut } = useAuth();
  const live = useLive();
  const [plugCount, setPlugCount] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.from('smart_plug').select('*', { count: 'exact', head: true }).then(({ count }) => setPlugCount(count ?? 0));
      supabase.rpc('current_rate').then(({ data }) => {
        const perKwh = (data as { rate_per_kwh: number | null } | null)?.rate_per_kwh;
        setRate(perKwh != null ? Number(perKwh) : null);
      });
    }, []),
  );

  if (!profile) return null;
  const initials = `${profile.user_firstname[0] ?? ''}${profile.user_lastname[0] ?? ''}`.toUpperCase();
  const applianceCount = live.appliances?.length ?? 0;

  return (
    <Screen>
      <Header title="Profile" subtitle="Account & preferences" />

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
          <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>
            {household?.household_name} · {applianceCount} {applianceCount === 1 ? 'appliance' : 'appliances'}
          </Text>
          <Pill text="OWNER" tone="ok" />
        </View>
      </Card>

      <SectionTitle title="Home & devices" />
      <Card style={{ paddingVertical: 4 }}>
        <Row first icon="flash-outline" title="Smart plugs" value={plugCount === null ? undefined : `${plugCount} paired`} onPress={() => router.push('/devices')} />
        <Row icon="home-outline" title="Home details" value={household?.household_name} onPress={() => router.push('/account-details')} />
        <Row icon="cash-outline" title="Electricity rate" value={rate !== null ? `${formatPeso(rate)}/kWh` : 'Not approved yet'} />
      </Card>

      <SectionTitle title="Account" />
      <Card style={{ paddingVertical: 4 }}>
        <Row first icon="person-outline" title="Edit profile" onPress={() => router.push('/account-details')} />
        <Row icon="notifications-outline" tone="warn" title="Alert levels" value="Per appliance" onPress={() => router.push('/devices')} />
        <Row icon="lock-closed-outline" title="Change password" onPress={() => router.push('/change-password')} />
        <Row icon="log-out-outline" tone="danger" title="Sign out" onPress={signOut} />
      </Card>
      <Text style={styles.footnote}>ElecTrack · Monitoring only. No remote power control.</Text>
    </Screen>
  );
}
