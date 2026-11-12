import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Card, Chips, colors, ErrorText, Field, Header, Pill, Screen, StateCard, styles } from '@/lib/ui';

type UserRow = Profile & { household: { household_name: string }[] | { household_name: string } | null };
type Filter = 'all' | 'active' | 'inactive';

const householdOf = (u: UserRow) => (Array.isArray(u.household) ? u.household[0] : u.household)?.household_name ?? null;

export default function AdminUsers() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('users')
        .select('*, household(household_name)')
        .eq('user_role', 'Resident')
        .order('user_lastname')
        .then(({ data, error }) => {
          if (error) return setError(error.message);
          setError(null);
          setUsers((data ?? []) as unknown as UserRow[]);
        });
    }, []),
  );

  const all = users ?? [];
  const active = all.filter((u) => u.account_status === 'Active').length;
  const words = search.trim().toLowerCase();
  const shown = all.filter(
    (u) =>
      (filter === 'all' || (filter === 'active') === (u.account_status === 'Active')) &&
      (!words || `${u.user_firstname} ${u.user_lastname} ${u.user_email} ${householdOf(u) ?? ''}`.toLowerCase().includes(words)),
  );

  return (
    <Screen>
      <Header title="User accounts" admin subtitle={users ? `${all.length} resident ${all.length === 1 ? 'account' : 'accounts'}` : undefined} />
      <Field label="Search" icon="search-outline" value={search} onChangeText={setSearch} placeholder="Name, email or household" autoCapitalize="none" />
      <Chips
        options={[
          { id: 'all', label: `All ${all.length}` },
          { id: 'active', label: `Active ${active}` },
          { id: 'inactive', label: `Deactivated ${all.length - active}` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorText>{error}</ErrorText>

      {!users ? (
        error ? null : <StateCard kind="loading" title="Loading accounts" />
      ) : shown.length === 0 ? (
        <StateCard kind="empty" title="No matching accounts" text={all.length === 0 ? 'Resident accounts appear here after they sign up.' : 'Try a different search or filter.'} />
      ) : (
        shown.map((u) => {
          const isActive = u.account_status === 'Active';
          return (
            <Card key={u.user_id} onPress={() => router.push({ pathname: '/admin-user', params: { id: u.user_id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(56,198,244,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.cyan, fontWeight: '700' }}>{`${u.user_firstname[0] ?? ''}${u.user_lastname[0] ?? ''}`.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.h3} numberOfLines={1}>
                    {u.user_firstname} {u.user_lastname}
                  </Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {u.user_email}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </View>
              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>
                  {householdOf(u) ?? 'No household set up yet'}
                </Text>
                <Pill text={isActive ? 'Active' : 'Deactivated'} tone={isActive ? 'ok' : 'danger'} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
