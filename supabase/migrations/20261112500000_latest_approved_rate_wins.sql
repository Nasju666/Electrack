-- ElecTrack — the most recently approved rate is the rate in use.
--
-- Before: the approved rate with the latest start date won, so a newly approved
-- rate could lose to an older entry that happened to carry a later date.
-- Now: approving a rate retires whatever was in use, whatever its dates.

-- Fetched rates start on the day VECO published them (it was the 1st of that month).
update electricity_rate
   set effective_from = substring(source_note from 'published (\d{4}-\d{2}-\d{2})')::date
 where rate_source = 'VECO Website'
   and source_note ~ 'published \d{4}-\d{2}-\d{2}';

create or replace function current_rate() returns public.electricity_rate
language sql stable security definer set search_path = '' as $$
  select r.*
  from public.electricity_rate r
  where r.verification_status = 'Approved'
    and r.effective_from <= (now() at time zone 'Asia/Manila')::date
    and (r.effective_to is null or r.effective_to >= (now() at time zone 'Asia/Manila')::date)
  order by r.approved_at desc nulls last, r.electricityrate_id desc
  limit 1
$$;

create or replace function admin_approve_rate(p_rate_id int, p_rate_per_kwh numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rate  public.electricity_rate;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into v_rate from public.electricity_rate where electricityrate_id = p_rate_id;
  if not found then raise exception 'No such rate.'; end if;
  if v_rate.verification_status <> 'Pending' then raise exception 'This rate is already %.', lower(v_rate.verification_status); end if;
  if coalesce(p_rate_per_kwh, v_rate.rate_per_kwh) <= 0 then raise exception 'The rate must be more than zero.'; end if;
  if v_rate.effective_from > v_today then raise exception 'This rate starts on %, which is in the future. Approve it on or after that day.', v_rate.effective_from; end if;

  -- Retire every rate still in use: its last day was yesterday.
  update public.electricity_rate
     set effective_to = greatest(effective_from, v_today - 1)
   where verification_status = 'Approved' and effective_to is null;

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

-- One-time tidy-up: keep only the most recently approved rate in use.
update electricity_rate r
   set effective_to = greatest(r.effective_from, (now() at time zone 'Asia/Manila')::date - 1)
 where r.verification_status = 'Approved' and r.effective_to is null
   and r.electricityrate_id <> (
     select w.electricityrate_id from electricity_rate w
     where w.verification_status = 'Approved' and w.effective_to is null
     order by w.approved_at desc nulls last, w.electricityrate_id desc limit 1
   );
