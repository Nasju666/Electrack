-- ElecTrack — accounts, the full data model, and per-user security.
-- Completes the manuscript's Data Dictionary (Tables 7-16).
--
-- Where this differs from the manuscript, and why:
--   * users.user_id is a UUID (not INT) because it is the Supabase Auth id.
--     Passwords are hashed and stored by Supabase Auth, not in this table.
--   * smart_plug.household_id may be empty: a device that nobody has paired
--     yet belongs to no household.
--   * electricity_rate has no household_id. Per the ERD narrative there is one
--     VECO rate for all households; it carries source, status and approver.

-- 1. Remove the slice's demo household and its temporary public-read rules ----
drop policy "slice: public read" on smart_plug;
drop policy "slice: public read" on appliance;
drop policy "slice: public read" on consumption_reading;

delete from consumption_reading;
delete from appliance;
alter table smart_plug alter column household_id drop not null;
update smart_plug set household_id = null, smartplug_status = 'Offline';   -- both devices become "unpaired"
delete from household;

-- 2. Accounts ---------------------------------------------------------------
create table users (
  user_id         uuid primary key references auth.users on delete cascade,
  user_firstname  varchar(50)  not null,
  user_lastname   varchar(50)  not null,
  user_middlename varchar(50)  not null default '',
  user_email      varchar(255) not null,
  user_role       varchar(20)  not null default 'Resident' check (user_role in ('Resident', 'Admin')),
  account_status  varchar(20)  not null default 'Active'   check (account_status in ('Active', 'Inactive')),
  user_createdat  timestamptz  not null default now()
);

-- Every sign-up automatically gets a Resident profile. Nobody can register as Admin.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (user_id, user_firstname, user_lastname, user_middlename, user_email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'New'), 50),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), 'User'), 50),
    left(coalesce(trim(new.raw_user_meta_data ->> 'middle_name'), ''), 50),
    new.email
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table household
  alter column user_id set not null,
  add constraint household_user_fk foreign key (user_id) references users,
  add constraint household_one_per_user unique (user_id);

-- An outlet can hold a new appliance after the old one is removed; history stays.
alter table appliance drop constraint appliance_smartplug_id_outlet_no_key;
create unique index appliance_one_active_per_outlet
  on appliance (smartplug_id, outlet_no) where appliance_status <> 'Removed';

-- 3. Remaining tables -------------------------------------------------------
create table electricity_rate (
  electricityrate_id  int generated always as identity primary key,
  rate_per_kwh        numeric(10,4) not null check (rate_per_kwh > 0),
  currency            varchar(10)   not null default 'PHP',
  effective_from      date          not null,
  effective_to        date,
  rate_source         varchar(20)   not null check (rate_source in ('VECO Website', 'Manual')),
  verification_status varchar(20)   not null default 'Pending'
                      check (verification_status in ('Pending', 'Approved', 'Rejected')),
  approved_by         uuid references users,
  approved_at         timestamptz,
  rate_createdat      timestamptz   not null default now()
);

create table bill_estimate (
  billestimate_id      int generated always as identity primary key,
  household_id         int  not null references household,
  electricityrate_id   int  not null references electricity_rate,
  billing_period_start date not null,
  billing_period_end   date not null,
  usage_sofar_kwh      numeric(12,2) not null,
  forecast_kwh         numeric(12,2),
  estimated_cost       numeric(12,2) not null,
  generated_at         timestamptz   not null default now(),
  unique (household_id, billing_period_start)
);

create table ai_recommendation (
  recommendation_id     int generated always as identity primary key,
  household_id          int not null references household,
  appliance_id          int references appliance,
  insight_type          varchar(50) not null,
  pattern_summary       text,
  recommendation_text   text not null,
  estimated_savings_kwh numeric(10,2),
  generated_at          timestamptz not null default now()
);

create table notification (
  notification_id        bigint generated always as identity primary key,
  user_id                uuid not null references users,
  smartplug_id           int references smart_plug,
  appliance_id           int references appliance,
  reading_id             bigint references consumption_reading,
  notification_type      varchar(30) not null,
  notification_message   text not null,
  notification_isread    boolean not null default false,
  notification_timestamp timestamptz not null default now()
);
create index notification_user_time on notification (user_id, notification_timestamp desc);

create table admin_action_log (
  log_id           bigint generated always as identity primary key,
  admin_id         uuid not null references users,
  target_user_id   uuid references users,
  target_rate_id   int references electricity_rate,
  action_type      varchar(50) not null,
  action_details   text,
  action_timestamp timestamptz not null default now()
);

-- 4. Who am I? (used by the security rules below) ---------------------------
-- Both return nothing for a deactivated account, which locks it out of all data.
create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users
    where user_id = auth.uid() and user_role = 'Admin' and account_status = 'Active'
  )
$$;

create function my_household_id() returns int
language sql stable security definer set search_path = '' as $$
  select h.household_id
  from public.household h
  join public.users u on u.user_id = h.user_id
  where h.user_id = auth.uid() and u.account_status = 'Active'
$$;

-- 5. Pairing ----------------------------------------------------------------
-- A resident claims a device by typing the code printed on it.
create function pair_smart_plug(p_code text, p_name text default null) returns smart_plug
language plpgsql security definer set search_path = '' as $$
declare
  v_household int := public.my_household_id();
  v_code text := upper(trim(p_code));
  v_plug public.smart_plug;
begin
  if v_household is null then
    raise exception 'Set up your household first.';
  end if;

  update public.smart_plug
     set household_id = v_household,
         smartplug_name = coalesce(nullif(left(trim(p_name), 40), ''), smartplug_name)
   where smartplug_code = v_code and household_id is null
  returning * into v_plug;

  if not found then
    if exists (select 1 from public.smart_plug where smartplug_code = v_code and household_id = v_household) then
      raise exception 'This device is already paired to your household.';
    elsif exists (select 1 from public.smart_plug where smartplug_code = v_code) then
      raise exception 'This device is already paired to another household.';
    else
      raise exception 'No device found with code %.', v_code;
    end if;
  end if;
  return v_plug;
end $$;

-- Unpairing keeps past readings, retires the device's appliances, and frees the device.
create function unpair_smart_plug(p_smartplug_id int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household int := public.my_household_id();
begin
  if v_household is null or not exists (
    select 1 from public.smart_plug where smartplug_id = p_smartplug_id and household_id = v_household
  ) then
    raise exception 'That device is not paired to your household.';
  end if;
  update public.appliance set appliance_status = 'Removed'
   where smartplug_id = p_smartplug_id and appliance_status <> 'Removed';
  update public.smart_plug set household_id = null where smartplug_id = p_smartplug_id;
end $$;

revoke execute on function pair_smart_plug(text, text), unpair_smart_plug(int) from public, anon;
grant  execute on function pair_smart_plug(text, text), unpair_smart_plug(int) to authenticated;

-- 6. Security ---------------------------------------------------------------
-- Residents see only their own household. Admins see everything.
-- Signed-out visitors (anon) see nothing. Devices write only through `ingest`.
alter table users             enable row level security;
alter table electricity_rate  enable row level security;
alter table bill_estimate     enable row level security;
alter table ai_recommendation enable row level security;
alter table notification      enable row level security;
alter table admin_action_log  enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant  all on all tables in schema public to service_role;

-- users: read your own row (admins: all); edit only your own name.
grant select on users to authenticated;
grant update (user_firstname, user_lastname, user_middlename) on users to authenticated;
create policy "own profile or admin" on users for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy "edit own profile" on users for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- household: one per resident, created during onboarding.
grant select, insert on household to authenticated;
grant update (household_name, property_type, household_size) on household to authenticated;
create policy "own household or admin" on household for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy "create own household" on household for insert to authenticated
  with check (user_id = auth.uid());
create policy "edit own household" on household for update to authenticated
  using (household_id = my_household_id()) with check (household_id = my_household_id());

-- smart_plug: see your paired devices; rename them. Pair/unpair go through the functions above.
grant select on smart_plug to authenticated;
grant update (smartplug_name) on smart_plug to authenticated;
create policy "own devices or admin" on smart_plug for select to authenticated
  using (household_id = my_household_id() or is_admin());
create policy "rename own devices" on smart_plug for update to authenticated
  using (household_id = my_household_id()) with check (household_id = my_household_id());

-- appliance: manage the appliances on your own devices.
grant select, insert on appliance to authenticated;
grant update (appliance_name, appliance_category, appliance_location, appliance_status, usage_threshold_w)
  on appliance to authenticated;
create policy "own appliances or admin" on appliance for select to authenticated
  using (household_id = my_household_id() or is_admin());
create policy "add appliance to own device" on appliance for insert to authenticated
  with check (
    household_id = my_household_id()
    and smartplug_id in (
      select smartplug_id from smart_plug
      where household_id = my_household_id() and outlet_count >= appliance.outlet_no
    )
  );
create policy "edit own appliances" on appliance for update to authenticated
  using (household_id = my_household_id()) with check (household_id = my_household_id());

-- consumption_reading: read-only, your own appliances.
grant select on consumption_reading to authenticated;
create policy "own readings or admin" on consumption_reading for select to authenticated
  using (
    appliance_id in (select appliance_id from appliance where household_id = my_household_id())
    or is_admin()
  );

-- electricity_rate: residents see approved rates; admins manage all of them.
grant select, insert, update on electricity_rate to authenticated;
create policy "approved rates or admin" on electricity_rate for select to authenticated
  using (verification_status = 'Approved' or is_admin());
create policy "admin adds rates" on electricity_rate for insert to authenticated
  with check (is_admin());
create policy "admin updates rates" on electricity_rate for update to authenticated
  using (is_admin()) with check (is_admin());

-- bill_estimate, ai_recommendation: read-only for the household; written by the server.
grant select on bill_estimate, ai_recommendation to authenticated;
create policy "own estimates or admin" on bill_estimate for select to authenticated
  using (household_id = my_household_id() or is_admin());
create policy "own recommendations or admin" on ai_recommendation for select to authenticated
  using (household_id = my_household_id() or is_admin());

-- notification: read your own, mark them read.
grant select on notification to authenticated;
grant update (notification_isread) on notification to authenticated;
create policy "own notifications or admin" on notification for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy "mark own notifications read" on notification for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin_action_log: admins only.
grant select, insert on admin_action_log to authenticated;
create policy "admin reads log" on admin_action_log for select to authenticated
  using (is_admin());
create policy "admin writes own log" on admin_action_log for insert to authenticated
  with check (is_admin() and admin_id = auth.uid());
