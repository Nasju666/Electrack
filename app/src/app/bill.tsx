import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { formatKwh, formatPeso, manilaClock, MONTHS } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Card, colors, ErrorText, Header, Meter, Notice, Pill, Screen, Stat, StateCard, styles } from '@/lib/ui';

type Bill = {
  billing_period_start: string;
  billing_period_end: string;
  usage_sofar_kwh: number;
  forecast_kwh: number | null;
  estimated_cost: number;
  cost_sofar: number;
  rate_per_kwh: number;
};

export default function BillEstimate() {
  const router = useRouter();
  // undefined = loading, null = no approved rate yet
  const [bill, setBill] = useState<Bill | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('refresh_bill_estimate').then(({ data, error }) => {
        if (error) return setError(error.message);
        setBill((data as Bill | null) ?? null);
      });
    }, []),
  );

  const clock = manilaClock();
  const day = clock.getUTCDate();
  const daysInMonth = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth() + 1, 0)).getUTCDate();
  const month = MONTHS[clock.getUTCMonth()];
  const row = (label: string, value: string, color?: string, first = false) => (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.h3, color ? { color } : null]}>{value}</Text>
    </View>
  );

  return (
    <Screen bottom>
      <Header title="Bill estimate" subtitle={`${month} · day ${day} of ${daysInMonth}`} onBack={() => router.back()} />
      <ErrorText>{error}</ErrorText>

      {bill === undefined ? (
        error ? null : <StateCard kind="loading" title="Working out your estimate" />
      ) : bill === null ? (
        <StateCard kind="empty" title="No estimate yet" text="An administrator has to approve the VECO rate before ElecTrack can estimate your energy charge." />
      ) : (
        <>
          <Card accent>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.caps, { flex: 1 }]}>{bill.forecast_kwh != null ? 'Projected energy charge' : 'Energy charge so far'}</Text>
              <Pill text="ESTIMATE" tone="info" />
            </View>
            <Text style={[styles.big, { fontSize: 40, marginTop: 10 }]}>{formatPeso(Number(bill.forecast_kwh != null ? bill.estimated_cost : bill.cost_sofar))}</Text>
            <View style={{ height: 14 }} />
            <Meter fraction={day / daysInMonth} />
            <Text style={[styles.small, { marginTop: 10 }]}>
              {Math.round((day / daysInMonth) * 100)}% through {month}
              {bill.forecast_kwh != null && Number(bill.forecast_kwh) > 0
                ? ` · ${Math.round((Number(bill.usage_sofar_kwh) / Number(bill.forecast_kwh)) * 100)}% of the forecast used`
                : ' · a full-month projection appears after one day of readings'}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <Stat label="Usage so far" value={`${formatKwh(Number(bill.usage_sofar_kwh))} kWh`} note={`${formatPeso(Number(bill.cost_sofar))} energy charge`} />
            </Card>
            <Card style={{ flex: 1 }}>
              <Stat label="Forecast" value={bill.forecast_kwh != null ? `${formatKwh(Number(bill.forecast_kwh))} kWh` : '—'} note={`By ${month.slice(0, 3)} ${daysInMonth}`} />
            </Card>
          </View>

          <Card>
            <Text style={[styles.h2, { marginBottom: 4 }]}>Estimate breakdown</Text>
            {row('Energy used so far', formatPeso(Number(bill.cost_sofar)), undefined, true)}
            {row('Rate (VECO, admin-approved)', `${formatPeso(Number(bill.rate_per_kwh))} / kWh`)}
            {row('Fixed and other fees', 'Not included', colors.amber)}
          </Card>

          <Notice
            tone="warn"
            text="This is not a utility bill. It covers the energy charge of your monitored appliances only, and ElecTrack does not support bill payment."
          />
        </>
      )}
    </Screen>
  );
}
