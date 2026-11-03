-- Apply before deploying the updated collector and frontend.
alter table public.events add column if not exists attendance_conditions text not null default '';
alter table public.events add column if not exists location_precision text not null default 'unknown';
-- Append columns to preserve the existing view column order.
create or replace view public.active_events with (security_invoker = true) as
select id, dedupe_key, title, category, start_date, end_date, opening_hours,
venue, address, zip, city, country, lat, lng, location, description,
organizer, website, price, image_url, source_url, source_name,
confidence, first_seen_at, last_seen_at, created_at, updated_at,
attendance_conditions, location_precision
from public.events where status = 'active' and end_date >= current_date;
