-- Forma 2.1: diagnostics for GPS jammer/spoof protection.
-- Applied to Supabase project osxxmmutwehabkvylkki.

alter table public.sessions add column if not exists gps_filtered_points integer not null default 0;
alter table public.sessions add column if not exists gps_discontinuities integer not null default 0;
alter table public.sessions add column if not exists gps_spoof_detected boolean not null default false;
