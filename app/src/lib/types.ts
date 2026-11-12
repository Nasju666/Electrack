// Row shapes, named after the database tables.
export type Profile = {
  user_id: string;
  user_firstname: string;
  user_lastname: string;
  user_middlename: string;
  user_email: string;
  user_role: 'Resident' | 'Admin';
  account_status: 'Active' | 'Inactive';
};

export type Household = {
  household_id: number;
  household_name: string;
  property_type: string | null;
  household_size: number | null;
};

export type Appliance = {
  appliance_id: number;
  smartplug_id: number;
  outlet_no: number;
  appliance_name: string;
  appliance_category: string | null;
  appliance_location: string | null;
  appliance_status: string;
  usage_threshold_w: number | null;
};

export type SmartPlug = {
  smartplug_id: number;
  smartplug_code: string;
  smartplug_name: string | null;
  device_type: 'High-Power Plug' | 'Power Strip';
  outlet_count: number;
  smartplug_lastseen: string | null;
};

export type Reading = {
  appliance_id: number;
  reading_watts: number;
  reading_timestamp: string;
};

// A device reports every 30 s at most; after 90 s of silence we call it offline.
export const STALE_AFTER_MS = 90_000;
export const isRecent = (iso: string | null | undefined, now: number) =>
  !!iso && now - new Date(iso).getTime() < STALE_AFTER_MS;
