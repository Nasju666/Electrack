-- ElecTrack — thin-slice schema.
-- Table and column names follow the manuscript's Data Dictionary (Tables 8-11),
-- converted to snake_case. Later migrations add the remaining tables
-- (user profile, electricity_rate, bill_estimate, ai_recommendation,
-- notification, admin_action_log) and real per-user security.

create table household (
  household_id        int generated always as identity primary key,
  user_id             uuid,                       -- linked to the account table in the next migration
  household_name      varchar(50) not null,
  property_type       varchar(25),
  household_size      int,
  currency            varchar(10) not null default 'PHP',
  household_createdat timestamptz not null default now()
);

create table smart_plug (
  smartplug_id       int generated always as identity primary key,
  household_id       int not null references household,
  smartplug_code     varchar(50) not null unique,  -- the code the device sends with every reading
  smartplug_name     varchar(40),
  device_type        varchar(20) not null check (device_type in ('High-Power Plug', 'Power Strip')),
  outlet_count       int not null check (outlet_count in (1, 3)),
  firmware_version   varchar(20),
  smartplug_status   varchar(20) not null default 'Offline',
  smartplug_lastseen timestamptz
);

create table appliance (
  appliance_id       int generated always as identity primary key,
  household_id       int not null references household,
  smartplug_id       int not null references smart_plug,
  outlet_no          int not null check (outlet_no between 1 and 3),
  appliance_name     varchar(50) not null,
  appliance_category varchar(50),
  appliance_location varchar(50),
  appliance_status   varchar(25) not null default 'Active',
  usage_threshold_w  numeric(10,2),
  unique (smartplug_id, outlet_no)
);

create table consumption_reading (
  reading_id        bigint generated always as identity primary key,
  smartplug_id      int not null references smart_plug,
  appliance_id      int not null references appliance,
  reading_watts     numeric(10,2) not null,
  -- Cumulative energy counter of the meter channel (what the PZEM-004T reports).
  -- Energy used in a period = last counter - first counter.
  reading_kwh       numeric(12,4) not null,
  reading_voltage   numeric(8,2),
  reading_current   numeric(8,3),
  reading_timestamp timestamptz not null default now()   -- set by the server, so devices need no clock
);

create index consumption_reading_appliance_time
  on consumption_reading (appliance_id, reading_timestamp desc);

-- Security ------------------------------------------------------------------
-- Row Level Security is ON for every table. Writes only happen through the
-- `ingest` Edge Function (secret key, bypasses RLS).
alter table household           enable row level security;
alter table smart_plug          enable row level security;
alter table appliance           enable row level security;
alter table consumption_reading enable row level security;

-- TEMPORARY (slice only): the app has no login yet, so anyone holding the
-- publishable key may READ these three tables. Replaced by per-household
-- policies in the auth migration. Do not put real household data in before then.
create policy "slice: public read" on smart_plug          for select to anon using (true);
create policy "slice: public read" on appliance           for select to anon using (true);
create policy "slice: public read" on consumption_reading for select to anon using (true);

-- Live updates: broadcast every new reading to subscribed apps.
alter publication supabase_realtime add table consumption_reading;

-- Demo data -----------------------------------------------------------------
-- One household with the two prototype devices and four appliances, matching
-- what the simulator (and later the real firmware) sends.
with h as (
  insert into household (household_name, property_type, household_size)
  values ('Demo Household', 'House', 4)
  returning household_id
), p as (
  insert into smart_plug (household_id, smartplug_code, smartplug_name, device_type, outlet_count)
  select household_id, v.code, v.name, v.type, v.outlets
  from h, (values
    ('ELT-PLUG-001',  'High-Power Plug', 'High-Power Plug', 1),
    ('ELT-STRIP-001', 'Power Strip',     'Power Strip',     3)
  ) as v(code, name, type, outlets)
  returning smartplug_id, household_id, smartplug_code
)
insert into appliance (household_id, smartplug_id, outlet_no, appliance_name, appliance_category, appliance_location, usage_threshold_w)
select p.household_id, p.smartplug_id, v.outlet_no, v.name, v.category, v.location, v.threshold
from p
join (values
  ('ELT-PLUG-001',  1, 'Aircon 1.5HP',   'Air Conditioner', 'Bedroom',     1600),
  ('ELT-STRIP-001', 1, 'Electric Fan',   'Electric Fan',    'Living Room', 120),
  ('ELT-STRIP-001', 2, 'Television',     'Television',      'Living Room', 140),
  ('ELT-STRIP-001', 3, 'Laptop Charger', 'Laptop Charger',  'Living Room', 120)
) as v(code, outlet_no, name, category, location, threshold)
  on v.code = p.smartplug_code;
