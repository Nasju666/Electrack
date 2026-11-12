import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Runs `onChange` whenever one of the signed-in user's notifications is created or updated. */
export function useAlertChanges(channelName: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification' }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, onChange]);
}

/** Number of unread alerts, kept current. Used for the badge on the Alerts tab. */
export function useUnreadAlerts() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from('notification')
      .select('*', { count: 'exact', head: true })
      .eq('notification_isread', false);
    setCount(count ?? 0);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useAlertChanges('alerts-badge', refresh);
  return count;
}
