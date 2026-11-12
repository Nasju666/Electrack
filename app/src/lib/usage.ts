// Energy history helpers. All days and hours are Philippine time.
import { dayKey, manilaClock, manilaInstant, WEEKDAYS, MONTHS } from './format';
import { supabase } from './supabase';

export type UsageRow = { bucket: string; appliance_id: number; kwh: number };
export type Day = { key: string; letter: string; title: string };

/** The last `count` days, oldest first, ending today. */
export function lastDays(count: number): Day[] {
  const now = manilaClock();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (count - 1 - i)));
    return {
      key: dayKey(d),
      letter: WEEKDAYS[d.getUTCDay()][0],
      title: `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`,
    };
  });
}

/**
 * Energy per appliance per hour or day, from midnight `daysBack` days ago until now.
 * Fetched in pages, because the server returns at most 1000 rows at a time.
 */
export async function fetchUsage(daysBack: number, bucket: 'hour' | 'day'): Promise<UsageRow[]> {
  const now = manilaClock();
  const from = manilaInstant(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack);
  const rows: UsageRow[] = [];
  const PAGE = 1000;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .rpc('usage_buckets', { p_from: from.toISOString(), p_to: new Date().toISOString(), p_bucket: bucket })
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as UsageRow[];
    rows.push(...page.map((r) => ({ ...r, kwh: Number(r.kwh) })));
    if (page.length < PAGE) return rows;
  }
}

export const dayOf = (row: UsageRow) => row.bucket.slice(0, 10);
export const hourOf = (row: UsageRow) => Number(row.bucket.slice(11, 13));

/** Sum of kWh grouped by a key. */
export function sumBy<K extends string | number>(rows: UsageRow[], key: (r: UsageRow) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + r.kwh;
  return out;
}

export const total = (rows: UsageRow[]) => rows.reduce((sum, r) => sum + r.kwh, 0);

export type Change = {
  pct: number;
  lower: boolean; // lower or unchanged
  short: string; // "4.1% higher", "No change"
  phrase: string; // "4.1% higher than", "About the same as"
};

/** How `current` compares with `previous`, or null when there is nothing to compare with. */
export function change(current: number, previous: number): Change | null {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { pct: 0, lower: true, short: 'No change', phrase: 'About the same as' };
  const short = `${Math.abs(pct).toFixed(1)}% ${pct < 0 ? 'lower' : 'higher'}`;
  return { pct, lower: pct < 0, short, phrase: `${short} than` };
}
