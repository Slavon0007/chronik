-- Chronik · Supabase / PostgreSQL schema
-- Run once in the Supabase SQL editor, then set the project URL and service key
-- in GitHub Actions secrets.

create extension if not exists postgis;
create extension if not exists pg_trgm;

do $$
begin
  create type public.event_category as enum ('markt', 'reenactment', 'larp', 'turnier', 'cosplay');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  dedupe_key      text not null unique,
  title           text not null,
  category        public.event_category not null,
  start_date      date not null,
  end_date        date not null,
  opening_hours   text not null default '',
  venue           text not null default '',
  address         text not null default '',
  zip             text not null default '',
  city            text not null default '',
  country         char(2) not null default 'DE',
  lat             double precision,
  lng             double precision,
  location        geography(Point, 4326),
  description     text not null default '',
  organizer       text not null default '',
  website         text not null default '',
  price           text not null default '',
  image_url       text not null default '',
  source_url      text not null default '',
  source_name     text not null default '',
  source_urls     text[] not null default '{}',
  confidence      numeric(3, 2) not null default 0.50 check (confidence between 0 and 1),
  status          text not null default 'active' check (status in ('active', 'archived', 'draft')),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint events_valid_dates check (end_date >= start_date),
  constraint events_valid_lat check (lat is null or lat between -90 and 90),
  constraint events_valid_lng check (lng is null or lng between -180 and 180),
  constraint events_location_pair check ((lat is null) = (lng is null))
);

create index if not exists events_location_gix on public.events using gist (location);
create index if not exists events_dates_idx on public.events (start_date, end_date);
create index if not exists events_category_idx on public.events (category);
create index if not exists events_active_idx on public.events (start_date) where status = 'active';
create index if not exists events_title_trgm_idx on public.events using gin (title gin_trgm_ops);
create index if not exists events_city_trgm_idx on public.events using gin (city gin_trgm_ops);

-- Keep geography in sync with the lat/lng pair, and maintain updated_at.
create or replace function public.sync_event_location()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  else
    new.location := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_sync_location on public.events;
create trigger events_sync_location
  before insert or update on public.events
  for each row execute function public.sync_event_location();

-- Public read model: only active, non-expired events.
create or replace view public.active_events
with (security_invoker = true)
as
select
  id, dedupe_key, title, category, start_date, end_date, opening_hours,
  venue, address, zip, city, country, lat, lng, location, description,
  organizer, website, price, image_url, source_url, source_name,
  confidence, first_seen_at, last_seen_at, created_at, updated_at
from public.events
where status = 'active'
  and end_date >= current_date;

comment on view public.active_events is
  'Read model consumed by the Chronik PWA; past events disappear automatically.';

-- Instant radius search (PostGIS geography, metres).
create or replace function public.events_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 150,
  p_categories text[] default null,
  p_from date default current_date,
  p_to date default null
)
returns setof public.active_events
language sql
stable
security invoker
as $$
  with center as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geog
  )
  select e.*
  from public.active_events e, center c
  where st_dwithin(e.location, c.geog, greatest(p_radius_km, 0.1) * 1000)
    and e.end_date >= coalesce(p_from, current_date)
    and e.start_date <= coalesce(p_to, 'infinity'::date)
    and (p_categories is null or e.category::text = any (p_categories))
  order by st_distance(e.location, c.geog) asc, e.start_date asc;
$$;

comment on function public.events_near(
  double precision, double precision, double precision, text[], date, date
) is
  'Returns active events within a radius in kilometres. Categories are optional text[].';

-- Nightly archive job; callable by the collector (service role).
create or replace function public.archive_past_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer;
begin
  update public.events
     set status = 'archived'
   where status = 'active'
     and end_date < current_date;
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_past_events() from public;
grant execute on function public.archive_past_events() to service_role;

-- Operational log for the scheduled collector.
create table if not exists public.crawl_runs (
  id                bigint generated always as identity primary key,
  started_at        timestamptz not null,
  finished_at       timestamptz not null default now(),
  sources_total     integer not null default 0,
  pages_fetched     integer not null default 0,
  events_found      integer not null default 0,
  events_published  integer not null default 0,
  duplicates_merged integer not null default 0,
  status            text not null default 'ok' check (status in ('ok', 'partial', 'failed')),
  error             text not null default '',
  created_at        timestamptz not null default now()
);

alter table public.crawl_runs enable row level security;
-- No public policies: only service_role (which bypasses RLS) may read/write.

-- Row level security -------------------------------------------------------
alter table public.events enable row level security;

drop policy if exists "Public can read active events" on public.events;
create policy "Public can read active events"
  on public.events
  for select
  to anon, authenticated
  using (status = 'active' and end_date >= current_date);

-- Writes are intentionally limited to the service role, which bypasses RLS.
revoke insert, update, delete on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.active_events to anon, authenticated;
grant execute on function public.events_near(
  double precision, double precision, double precision, text[], date, date
) to anon, authenticated;

-- Apply before deploying the updated collector and frontend.
alter table public.events add column if not exists attendance_conditions text not null default '';
alter table public.events add column if not exists location_precision text not null default 'unknown';
alter table public.events add column if not exists event_status text not null default '';
-- Append columns to preserve the existing view column order.
create or replace view public.active_events with (security_invoker = true) as
select id, dedupe_key, title, category, start_date, end_date, opening_hours,
venue, address, zip, city, country, lat, lng, location, description,
organizer, website, price, image_url, source_url, source_name,
confidence, first_seen_at, last_seen_at, created_at, updated_at,
attendance_conditions, location_precision, event_status
from public.events where status = 'active' and end_date >= current_date;

-- Optional: run the archive step inside Supabase as well.
-- Requires the pg_cron extension to be enabled for the project.
-- select cron.schedule('archive-past-events', '15 3 * * *', $$select public.archive_past_events();$$);
