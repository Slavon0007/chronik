alter table public.events add column if not exists event_status text not null default '';

create or replace view public.active_events with (security_invoker = true) as
select id, dedupe_key, title, category, start_date, end_date, opening_hours,
venue, address, zip, city, country, lat, lng, location, description,
organizer, website, price, image_url, source_url, source_name,
confidence, first_seen_at, last_seen_at, created_at, updated_at,
attendance_conditions, location_precision, event_status
from public.events where status = 'active' and end_date >= current_date;
