-- ElecTrack — energy history and the monthly bill estimate.
--
-- Energy comes from the meters' running kWh counters: the energy used between
-- two consecutive readings of an appliance is (this counter - previous counter).
-- A counter that goes backwards (meter replaced or reset) counts as zero.
-- Days and months are Philippine time.

-- Faster per-row security check for the largest table (evaluated once per query).
drop policy "own readings or admin" on consumption_reading;
create policy "own readings or admin" on consumption_reading for select to authenticated
  using (
    appliance_id in (select appliance_id from appliance where household_id = (select my_household_id()))
    or (select is_admin())
  );

-- Energy per appliance for the signed-in resident's household, grouped by hour or day.
create function usage_buckets(p_from timestamptz, p_to timestamptz, p_bucket text)
returns table (bucket timestamp, appliance_id int, kwh numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_bucket not in ('hour', 'day') then
    raise exception 'p_bucket must be hour or day';
  end if;
  return query
  with steps as (
    select cr.appliance_id,
           cr.reading_timestamp,
           cr.reading_kwh - lag(cr.reading_kwh) over (
             partition by cr.appliance_id order by cr.reading_timestamp
           ) as delta
    from public.consumption_reading cr
    join public.appliance a on a.appliance_id = cr.appliance_id
    where a.household_id = public.my_household_id()
      -- one extra day back, so the first reading in range has a predecessor
      and cr.reading_timestamp >= p_from - interval '1 day'
      and cr.reading_timestamp < p_to
  )
  select date_trunc(p_bucket, s.reading_timestamp at time zone 'Asia/Manila'),
         s.appliance_id,
         round(sum(greatest(s.delta, 0)), 4)
  from steps s
  where s.reading_timestamp >= p_from and s.delta is not null
  group by 1, 2
  order by 1, 2;
end $$;

-- The rate in force today: approved by an admin and inside its effective dates.
create function current_rate() returns public.electricity_rate
language sql stable security definer set search_path = '' as $$
  select r.*
  from public.electricity_rate r
  where r.verification_status = 'Approved'
    and r.effective_from <= (now() at time zone 'Asia/Manila')::date
    and (r.effective_to is null or r.effective_to >= (now() at time zone 'Asia/Manila')::date)
  order by r.effective_from desc, r.electricityrate_id desc
  limit 1
$$;

-- Recalculates and stores this month's estimate for the signed-in resident's
-- household, and returns it. Returns null when there is no approved rate yet.
--   usage so far  = energy recorded since the 1st of the month
--   forecast      = usage so far + (average daily use so far x days remaining),
--                   only once at least one full day of readings exists
--   estimated cost = forecast (or usage so far, if no forecast yet) x approved rate
create function refresh_bill_estimate() returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_household int := public.my_household_id();
  v_rate      public.electricity_rate := public.current_rate();
  v_today     date := (now() at time zone 'Asia/Manila')::date;
  v_start     date := date_trunc('month', v_today)::date;
  v_end       date := (v_start + interval '1 month' - interval '1 day')::date;
  v_start_ts  timestamptz := v_start::timestamp at time zone 'Asia/Manila';
  v_end_ts    timestamptz := (v_end + 1)::timestamp at time zone 'Asia/Manila';
  v_first     timestamptz;
  v_usage     numeric;
  v_elapsed   numeric;
  v_forecast  numeric;
  v_row       public.bill_estimate;
begin
  if v_household is null or v_rate.electricityrate_id is null then
    return null;
  end if;

  select coalesce(sum(u.kwh), 0) into v_usage
  from public.usage_buckets(v_start_ts, now(), 'day') u;

  select min(cr.reading_timestamp) into v_first
  from public.consumption_reading cr
  join public.appliance a on a.appliance_id = cr.appliance_id
  where a.household_id = v_household and cr.reading_timestamp >= v_start_ts;

  v_elapsed := extract(epoch from now() - v_first) / 86400.0;   -- days of data this month
  if v_elapsed >= 1 then
    v_forecast := v_usage + (v_usage / v_elapsed) * (extract(epoch from v_end_ts - now()) / 86400.0);
  end if;

  insert into public.bill_estimate as b
    (household_id, electricityrate_id, billing_period_start, billing_period_end,
     usage_sofar_kwh, forecast_kwh, estimated_cost, generated_at)
  values
    (v_household, v_rate.electricityrate_id, v_start, v_end,
     round(v_usage, 2), round(v_forecast, 2),
     round(coalesce(v_forecast, v_usage) * v_rate.rate_per_kwh, 2), now())
  on conflict (household_id, billing_period_start) do update set
    electricityrate_id = excluded.electricityrate_id,
    usage_sofar_kwh    = excluded.usage_sofar_kwh,
    forecast_kwh       = excluded.forecast_kwh,
    estimated_cost     = excluded.estimated_cost,
    generated_at       = excluded.generated_at
  returning * into v_row;

  return json_build_object(
    'billing_period_start', v_row.billing_period_start,
    'billing_period_end',   v_row.billing_period_end,
    'usage_sofar_kwh',      v_row.usage_sofar_kwh,
    'forecast_kwh',         v_row.forecast_kwh,
    'estimated_cost',       v_row.estimated_cost,
    'cost_sofar',           round(v_usage * v_rate.rate_per_kwh, 2),
    'rate_per_kwh',         v_rate.rate_per_kwh,
    'rate_effective_from',  v_rate.effective_from
  );
end $$;

revoke execute on function usage_buckets(timestamptz, timestamptz, text), current_rate(), refresh_bill_estimate() from public, anon;
grant  execute on function usage_buckets(timestamptz, timestamptz, text), current_rate(), refresh_bill_estimate() to authenticated;
