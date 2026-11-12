import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Button, Card, colors, ErrorText, Screen } from '@/lib/ui';

type UserRow = Profile & { user_createdat: string; household: { household_name: string }[] | { household_name: string } | null };

const householdOf = (u: UserRow) => {
  const h = Array.isArray(u.household) ? u.household[0] : u.household;
  return h?.household_name ?? null;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*, household(household_name)')
      .order('user_role')
      .order('user_lastname');
    if (error) return setError(error.message);
    setError(null);
    setUsers((data ?? []) as unknown as UserRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirm(user: UserRow) {
    const deactivate = user.account_status === 'Active';
    const name = `${user.user_firstname} ${user.user_lastname}`;
    Alert.alert(
      deactivate ? `Deactivate ${name}?` : `Reactivate ${name}?`,
      deactivate
        ? 'They will be locked out of their household data until you reactivate the account. Nothing is deleted.'
        : 'They will be able to sign in and see their household data again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deactivate ? 'Deactivate' : 'Reactivate',
          style: deactivate ? 'destructive' : 'default',
          onPress: async () => {
            setBusyId(user.user_id);
            const { error } = await supabase.rpc('admin_set_account_status', {
              p_user_id: user.user_id,
              p_status: deactivate ? 'Inactive' : 'Active',
            });
            setBusyId(null);
            if (error) setError(error.message);
            load();
          },
        },
      ],
    );
  }

  return (
    <Screen edges={[]}>
      <ErrorText>{error}</ErrorText>
      {!users ? (
        error ? null : <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        users.map((user) => {
          const active = user.account_status === 'Active';
          const admin = user.user_role === 'Admin';
          return (
            <Card key={user.user_id}>
              <View style={s.top}>
                <Text style={s.name} numberOfLines={1}>
                  {user.user_firstname} {user.user_lastname}
                </Text>
                <View style={[s.badge, { backgroundColor: active ? '#DDF3E9' : '#F6E1DF' }]}>
                  <Text style={[s.badgeText, { color: active ? '#11734C' : colors.danger }]}>
                    {admin ? 'Admin' : active ? 'Active' : 'Deactivated'}
                  </Text>
                </View>
              </View>
              <Text style={s.sub}>{user.user_email}</Text>
              <Text style={s.sub}>
                {admin ? 'Administrator' : (householdOf(user) ?? 'No household set up yet')} · joined{' '}
                {new Date(user.user_createdat).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
              {admin ? null : (
                <Button
                  title={active ? 'Deactivate account' : 'Reactivate account'}
                  kind={active ? 'danger' : 'secondary'}
                  busy={busyId === user.user_id}
                  onPress={() => confirm(user)}
                />
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text, paddingRight: 8 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
