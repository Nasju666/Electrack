// Shapes returned by the admin_summary() database function.
export type HouseholdRow = {
  household_id: number;
  household_name: string;
  owner: string;
  account_status: string;
  devices: number;
  devices_online: number;
  month_kwh: number;
  today_kwh: number;
  alerts_month: number;
};

export type Summary = {
  households: number;
  residents_active: number;
  residents_inactive: number;
  devices_paired: number;
  devices_online: number;
  devices_unpaired: number;
  month_kwh: number;
  today_kwh: number;
  alerts_high_usage: number;
  alerts_offline: number;
  alerts_unusual: number;
  pending_rates: number;
  by_household: HouseholdRow[];
};

export type Rate = {
  electricityrate_id: number;
  rate_per_kwh: number;
  effective_from: string;
  effective_to: string | null;
  rate_source: 'VECO Website' | 'Manual';
  verification_status: 'Pending' | 'Approved' | 'Rejected';
  source_url: string | null;
  source_note: string | null;
  approved_at: string | null;
};

export const prettyDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
