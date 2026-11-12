-- ElecTrack — admin side: user accounts, VECO rate approval, summary report.
-- Every admin action goes through a function that checks the caller is an
-- active admin and writes a line to admin_action_log.

-- Where a fetched rate came from, so the admin can verify it against the article.
alter table electricity_rate
  add column source_url  text,
  add column source_note text;
create unique index electricity_rate_one_per_article on electricity_rate (source_url) where source_url is not null;

-- Admins may add a rate only as Pending; approving happens in admin_approve_rate().
drop policy "admin adds rates" on electricity_rate;
drop policy "admin updates rates" on electricity_rate;
revoke insert, update on electricity_rate from authenticated;
grant insert (rate_per_kwh, effective_from, rate_source) on electricity_rate to authenticated;
create policy "admin adds pending rates" on electricity_rate for insert to authenticated
  with check (is_admin() and verification_status = 'Pending' and approved_by is null);

-- The log is written only by the functions below.
drop policy "admin writes own log" on admin_action_log;
revoke insert on admin_action_log from authenticated;

-- Deactivate or reactivate a resident account -------------------------------
create function admin_set_account_status(p_user_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.users;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_status not in ('Active', 'Inactive') then raise exception 'Status must be Active or Inactive.'; end if;

  select * into v_target from public.users where user_id = p_user_id;
  if not found then raise exception 'No such user.'; end if;
  if v_target.user_role = 'Admin' then raise exception 'Admin accounts cannot be changed here.'; end if;
  if v_target.account_status = p_status then return; end if;

  update public.users set account_status = p_status where user_id = p_user_id;
  insert into public.admin_action_log (admin_id, target_user_id, action_type, action_details)
  values (auth.uid(), p_user_id,
          case p_status when 'Inactive' then 'Deactivate Account' else 'Reactivate Account' end,
          v_target.user_email);
end $$;

-- Approve a pending rate (optionally correcting the number first) -------------
-- The previously approved rate is closed the day before the new one starts.
create function admin_approve_rate(p_rate_id int, p_rate_per_kwh numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rate public.electricity_rate;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into v_rate from public.electricity_rate where electricityrate_id = p_rate_id;
  if not found then raise exception 'No such rate.'; end if;
  if v_rate.verification_status <> 'Pending' then raise exception 'This rate is already %.', lower(v_rate.verification_status); end if;
  if coalesce(p_rate_per_kwh, v_rate.rate_per_kwh) <= 0 then raise exception 'The rate must be more than zero.'; end if;

  update public.electricity_rate
     set effective_to = v_rate.effective_from - 1
   where verification_status = 'Approved' and effective_to is null
     and effective_from <= v_rate.effective_from and electricityrate_id <> p_rate_id;

  update public.electricity_rate
     set rate_per_kwh = coalesce(p_rate_per_kwh, rate_per_kwh),
         verification_status = 'Approved', approved_by = auth.uid(), approved_at = now()
   where electricityrate_id = p_rate_id;

  insert into public.admin_action_log (admin_id, target_rate_id, action_type, action_details)
  values (auth.uid(), p_rate_id, 'Approve Rate',
          format('PHP %s per kWh from %s (%s)%s', to_char(coalesce(p_rate_per_kwh, v_rate.rate_per_kwh), 'FM999990.00'), v_rate.effective_from, v_rate.rate_source,
                 case when p_rate_per_kwh is not null and p_rate_per_kwh <> v_rate.rate_per_kwh
                      then format(', corrected from %s', to_char(v_rate.rate_per_kwh, 'FM999990.00')) else '' end));
end $$;

create function admin_reject_rate(p_rate_id int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rate public.electricity_rate;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into v_rate from public.electricity_rate where electricityrate_id = p_rate_id;
  if not found then raise exception 'No such rate.'; end if;
  if v_rate.verification_status <> 'Pending' then raise exception 'This rate is already %.', lower(v_rate.verification_status); end if;

  update public.electricity_rate set verification_status = 'Rejected' where electricityrate_id = p_rate_id;
  insert into public.admin_action_log (admin_id, target_rate_id, action_type, action_details)
  values (auth.uid(), p_rate_id, 'Reject Rate', format('PHP %s per kWh (%s)', to_char(v_rate.rate_per_kwh, 'FM999990.00'), v_rate.rate_source));
end $$;

-- Summary report: households, smart plug status, total consumption, alerts ---
create function admin_summary() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_month_ts timestamptz := date_trunc('month', v_today)::timestamp at time zone 'Asia/Manila';
  v_today_ts timestamptz := v_today::timestamp at time zone 'Asia/Manila';
  v_result   json;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;

  with steps as (
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
    select h.household_id, count(*) as n
    from public.notification n join public.household h on h.user_id = n.user_id
    where n.notification_timestamp >= v_month_ts group by h.household_id
  ), plugs as (
    select household_id, count(*) as n,
           count(*) filter (where smartplug_lastseen > now() - interval '3 minutes') as online
    from public.smart_plug where household_id is not null group by household_id
  ), rows as (
    select h.household_id, h.household_name,
           trim(u.user_firstname || ' ' || u.user_lastname) as owner, u.account_status,
           coalesce(p.n, 0) as devices, coalesce(p.online, 0) as devices_online,
           round(coalesce(e.month_kwh, 0), 2) as month_kwh, round(coalesce(e.today_kwh, 0), 2) as today_kwh,
           coalesce(al.n, 0) as alerts_month
    from public.household h
    join public.users u on u.user_id = h.user_id
    left join plugs p   on p.household_id = h.household_id
    left join energy e  on e.household_id = h.household_id
    left join alerts al on al.household_id = h.household_id
  )
  select json_build_object(
    'generated_at', now(),
    'households', (select count(*) from public.household),
    'residents_active',   (select count(*) from public.users where user_role = 'Resident' and account_status = 'Active'),
    'residents_inactive', (select count(*) from public.users where user_role = 'Resident' and account_status = 'Inactive'),
    'devices_paired',   (select count(*) from public.smart_plug where household_id is not null),
    'devices_online',   (select count(*) from public.smart_plug where household_id is not null and smartplug_lastseen > now() - interval '3 minutes'),
    'devices_unpaired', (select count(*) from public.smart_plug where household_id is null),
    'month_kwh', (select coalesce(sum(month_kwh), 0) from rows),
    'today_kwh', (select coalesce(sum(today_kwh), 0) from rows),
    'alerts_high_usage', (select count(*) from public.notification where notification_type = 'High Usage' and notification_timestamp >= v_month_ts),
    'alerts_offline',    (select count(*) from public.notification where notification_type = 'Device Offline' and notification_timestamp >= v_month_ts),
    'pending_rates', (select count(*) from public.electricity_rate where verification_status = 'Pending'),
    'by_household', (select coalesce(json_agg(r order by r.month_kwh desc, r.household_name), '[]'::json) from rows r)
  ) into v_result;
  return v_result;
end $$;

revoke execute on function admin_set_account_status(uuid, text), admin_approve_rate(int, numeric), admin_reject_rate(int), admin_summary() from public, anon;
grant  execute on function admin_set_account_status(uuid, text), admin_approve_rate(int, numeric), admin_reject_rate(int), admin_summary() to authenticated;
