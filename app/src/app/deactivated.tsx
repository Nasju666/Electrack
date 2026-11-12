import { useAuth } from '@/lib/auth';
import { Button, Screen, Title } from '@/lib/ui';

export default function Deactivated() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <Title sub="An administrator has deactivated this account, so its data is locked. Contact the ElecTrack administrator to have it reactivated.">
        Account deactivated
      </Title>
      <Button title="Sign out" onPress={signOut} kind="secondary" />
    </Screen>
  );
}
