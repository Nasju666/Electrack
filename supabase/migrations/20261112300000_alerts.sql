-- ElecTrack — alerts.
-- Two kinds of notification are created automatically:
--   'High Usage'      an appliance stays above its alert level
--   'Device Offline'  a paired device stops reporting
-- Both land in the notification table; the app shows them on the Alerts tab.

-- High usage: checked on every new reading.
-- Fires when this reading AND the previous one are above the appliance's alert
-- level (so a one-reading start-up surge is ignored), at most once every
-- 30 minutes per appliance.
create function check_high_usage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name      text;
  v_threshold numeric;
  v_user      uuid;
  v_previous  numeric;
begin
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

create trigger consumption_reading_high_usage
  after insert on consumption_reading
  for each row execute function check_high_usage();

-- Device offline: run on a schedule (see the next migration).
-- A paired device that was Online and has been silent for 3 minutes is marked
-- Offline and its owner is told once. It turns Online again on its next reading.
create function mark_offline_plugs() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with gone as (
    update public.smart_plug p
       set smartplug_status = 'Offline'
     where p.smartplug_status = 'Online'
       and p.smartplug_lastseen < now() - interval '3 minutes'
    returning p.smartplug_id, p.household_id, coalesce(p.smartplug_name, p.device_type) as label
  ), told as (
    insert into public.notification (user_id, smartplug_id, notification_type, notification_message)
    select h.user_id, g.smartplug_id, 'Device Offline',
           format('%s has stopped reporting. Check that it has power and Wi-Fi.', g.label)
    from gone g
    join public.household h on h.household_id = g.household_id   -- unpaired devices notify nobody
    returning 1
  )
  select count(*) into v_count from told;
  return v_count;
end $$;

revoke execute on function mark_offline_plugs() from public, anon, authenticated;

-- Let the app hear about new alerts as they are created.
alter publication supabase_realtime add table notification;
