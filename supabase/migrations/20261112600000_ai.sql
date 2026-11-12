-- ElecTrack — support for the AI module (ai/analyze.py), plus two small fixes.

-- Which day an insight is about. One "unusual usage" finding per appliance per day.
alter table ai_recommendation add column insight_date date;
alter table ai_recommendation
  add constraint ai_recommendation_one_per_day unique (appliance_id, insight_type, insight_date);

-- Hourly energy per appliance for every household, in Philippine time.
-- Only the AI job (which uses the secret key) may call this.
create function ai_hourly_usage(p_days int default 35)
returns table (household_id int, appliance_id int, hour_start timestamp, kwh numeric)
language sql stable security definer set search_path = '' as $$
  with steps as (
    select a.household_id, cr.appliance_id, cr.reading_timestamp,
           cr.reading_kwh - lag(cr.reading_kwh) over (
             partition by cr.appliance_id order by cr.reading_timestamp
           ) as delta
    from public.consumption_reading cr
    join public.appliance a on a.appliance_id = cr.appliance_id
    where cr.reading_timestamp >= now() - make_interval(days => p_days + 1)
  )
  select s.household_id, s.appliance_id,
         date_trunc('hour', s.reading_timestamp at time zone 'Asia/Manila'),
         round(sum(greatest(s.delta, 0)), 5)
  from steps s
  where s.delta is not null and s.reading_timestamp >= now() - make_interval(days => p_days)
  group by 1, 2, 3
$$;
revoke execute on function ai_hourly_usage(int) from public, anon, authenticated;
grant  execute on function ai_hourly_usage(int) to service_role;
grant  all on ai_recommendation, notification to service_role;

-- Fix: only live readings can raise a High Usage alert. Historical readings
-- loaded in bulk (ai/backfill.py) must not.
create or replace function check_high_usage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name      text;
  v_threshold numeric;
  v_user      uuid;
  v_previous  numeric;
begin
  if new.reading_timestamp < now() - interval '5 minutes' then
    return new;
  end if;

  select a.appliance_name, a.usage_threshold_w, h.user_id
    into v_name, v_threshold, v_user
  from public.appliance a
  join public.household h on h.household_id = a.household_id
  where a.appliance_id = new.appliance_id;

  if v_threshold is null or new.reading_watts <= v_threshold then
    return new;
  end if;

  select cr.reading_watts into v_previous
  from public.consumption_reading cr
  where cr.appliance_id = new.appliance_id and cr.reading_id <> new.reading_id
  order by cr.reading_timestamp desc
  limit 1;

  if v_previous is null or v_previous <= v_threshold then
    return new;
  end if;

  if exists (
    select 1 from public.notification n
    where n.appliance_id = new.appliance_id
      and n.notification_type = 'High Usage'
      and n.notification_timestamp > now() - interval '30 minutes'
  ) then
    return new;
  end if;

  insert into public.notification (user_id, smartplug_id, appliance_id, reading_id, notification_type, notification_message)
  values (
    v_user, new.smartplug_id, new.appliance_id, new.reading_id, 'High Usage',
    format('%s is drawing %s W, above your alert level of %s W.',
           v_name, to_char(round(new.reading_watts), 'FM999,999'), to_char(round(v_threshold), 'FM999,999'))
  );
  return new;
end $$;

-- Fix: the admin summary counts resident households only (an admin account
-- that went through household setup before being promoted is left out).
create or replace function admin_summary() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_month_ts timestamptz := date_trunc('month', v_today)::timestamp at time zone 'Asia/Manila';
  v_today_ts timestamptz := v_today::timestamp at time zone 'Asia/Manila';
  v_result   json;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;

  with homes as (
    select h.household_id, h.household_name, h.user_id,
           trim(u.user_firstname || ' ' || u.user_lastname) as owner, u.account_status
    from public.household h
    join public.users u on u.user_id = h.user_id
    where u.user_role = 'Resident'
  ), steps as (
    select a.household_id, cr.reading_timestamp,
           cr.reading_kwh - lag(cr.reading_kwh) over (partition by cr.appliance_id order by cr.reading_timestamp) as delta
    from public.consumption_reading cr
    join public.appliance a on a.appliance_id = cr.appliance_id
    where cr.reading_timestamp >= v_month_ts - interval '1 day'
  ), energy as (
    select household_id,
           coalesce(sum(greatest(delta, 0)) filter (where reading_timestamp >= v_month_ts), 0) as month_kwh,
           coalesce(sum(greatest(delta, 0)) filter (where reading_timestamp >= v_today_ts), 0) as today_kwh
    from steps where delta is not null group by household_id
  ), alerts as (
    select hm.household_id, n.notification_type, count(*) as n
    from public.notification n join homes hm on hm.user_id = n.user_id
    where n.notification_timestamp >= v_month_ts group by 1, 2
  ), plugs as (
    select p.household_id, count(*) as n,
           count(*) filter (where p.smartplug_lastseen > now() - interval '3 minutes') as online
    from public.smart_plug p join homes hm on hm.household_id = p.household_id group by p.household_id
  ), rows as (
    select hm.household_id, hm.household_name, hm.owner, hm.account_status,
           coalesce(p.n, 0) as devices, coalesce(p.online, 0) as devices_online,
           round(coalesce(e.month_kwh, 0), 2) as month_kwh, round(coalesce(e.today_kwh, 0), 2) as today_kwh,
           coalesce((select sum(al.n) from alerts al where al.household_id = hm.household_id), 0) as alerts_month
    from homes hm
    left join plugs p  on p.household_id = hm.household_id
    left join energy e on e.household_id = hm.household_id
  )
  select json_build_object(
    'generated_at', now(),
    'households', (select count(*) from homes),
    'residents_active',   (select count(*) from public.users where user_role = 'Resident' and account_status = 'Active'),
    'residents_inactive', (select count(*) from public.users where user_role = 'Resident' and account_status = 'Inactive'),
    'devices_paired',   (select coalesce(sum(n), 0) from plugs),
    'devices_online',   (select coalesce(sum(online), 0) from plugs),
    'devices_unpaired', (select count(*) from public.smart_plug where household_id is null),
    'month_kwh', (select coalesce(sum(month_kwh), 0) from rows),
    'today_kwh', (select coalesce(sum(today_kwh), 0) from rows),
    'alerts_high_usage', (select coalesce(sum(n), 0) from alerts where notification_type = 'High Usage'),
    'alerts_offline',    (select coalesce(sum(n), 0) from alerts where notification_type = 'Device Offline'),
    'alerts_unusual',    (select coalesce(sum(n), 0) from alerts where notification_type = 'Unusual Usage'),
    'pending_rates', (select count(*) from public.electricity_rate where verification_status = 'Pending'),
    'by_household', (select coalesce(json_agg(r order by r.month_kwh desc, r.household_name), '[]'::json) from rows r)
  ) into v_result;
  return v_result;
end $$;
