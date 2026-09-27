-- Mapa Mars database setup for Supabase.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it upgrades an existing setup in place.

-- ---------- Profiles: public username for each account ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_-]{3,24}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Usernames are unique regardless of case
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- Create the profile automatically when someone signs up.
-- The app passes the username in the sign-up metadata: { data: { username } }.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Mission logs ----------

create table if not exists public.mission_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  code text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  target text not null check (char_length(trim(target)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  date date,
  objective text not null default '' check (char_length(objective) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Mission codes (ABC-123). Upgrades older setups that didn't have codes yet.
alter table public.mission_logs add column if not exists code text;
update public.mission_logs
  set code = chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int)
    || '-' || lpad(floor(random() * 1000)::int::text, 3, '0')
  where code is null;
alter table public.mission_logs alter column code set not null;
alter table public.mission_logs drop constraint if exists mission_logs_code_format;
alter table public.mission_logs add constraint mission_logs_code_format check (code ~ '^[A-Z]{3}-[0-9]{3}$');
create unique index if not exists mission_logs_code_idx on public.mission_logs (code);

create index if not exists mission_logs_owner_idx on public.mission_logs (owner_id, created_at desc);

-- Mission status: 'open' (private, opened by code) or 'complete' (visible to everyone)
alter table public.mission_logs add column if not exists status text not null default 'open';
alter table public.mission_logs drop constraint if exists mission_logs_status_check;
alter table public.mission_logs add constraint mission_logs_status_check check (status in ('open', 'complete'));
alter table public.mission_logs add column if not exists completed_at timestamptz;
create index if not exists mission_logs_completed_idx on public.mission_logs (completed_at desc) where status = 'complete';

-- Stamp edits on the server so clients can't fake the time
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  new.owner_id := old.owner_id; -- missions can't be handed to someone else
  -- The completion time is set here, never by the client
  new.completed_at := old.completed_at;
  if new.status = 'complete' and old.status <> 'complete' then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mission_logs_touch on public.mission_logs;
create trigger mission_logs_touch
  before update on public.mission_logs
  for each row execute function public.touch_updated_at();

-- ---------- Access rules (Row Level Security) ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.mission_logs enable row level security;

-- Anyone can see usernames (they're shown on missions)
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles
  for select using (true);

-- Open missions are private: only the author (and admins) can list them.
-- Everyone else opens a mission by its code through get_mission_by_code() below.
drop policy if exists "Missions are public" on public.mission_logs;
drop policy if exists "Authors and admins read missions" on public.mission_logs;
create policy "Authors and admins read missions" on public.mission_logs
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Completed missions can be seen by everyone, signed in or not
drop policy if exists "Completed missions are public" on public.mission_logs;
create policy "Completed missions are public" on public.mission_logs
  for select to anon, authenticated
  using (status = 'complete');

-- Signed-in users can log missions as themselves; new missions always start open
drop policy if exists "Users log their own missions" on public.mission_logs;
create policy "Users log their own missions" on public.mission_logs
  for insert to authenticated with check (owner_id = auth.uid() and status = 'open');

-- Authors (and admins) can edit and delete
drop policy if exists "Authors and admins edit missions" on public.mission_logs;
create policy "Authors and admins edit missions" on public.mission_logs
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors and admins delete missions" on public.mission_logs;
create policy "Authors and admins delete missions" on public.mission_logs
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- No insert/update policies on profiles: rows are created by the trigger above,
-- and is_admin can only be changed from the dashboard (Table Editor -> profiles).

-- ---------- Mission code lookups ----------

-- Open one mission by its exact code (works signed out too).
-- Dropped first because its result columns changed when status was added.
drop function if exists public.get_mission_by_code(text);
create function public.get_mission_by_code(p_code text)
returns table (
  id uuid, owner_id uuid, code text, name text, target text, lat double precision, lon double precision,
  date date, objective text, status text, completed_at timestamptz, created_at timestamptz, updated_at timestamptz, username text
)
language sql
stable
security definer set search_path = ''
as $$
  select m.id, m.owner_id, m.code, m.name, m.target, m.lat, m.lon, m.date, m.objective, m.status, m.completed_at,
    m.created_at, m.updated_at, p.username
  from public.mission_logs m
  join public.profiles p on p.id = m.owner_id
  where m.code = upper(trim(p_code));
$$;

-- Is a code well-formed and unused? p_exclude skips the mission being edited.
create or replace function public.mission_code_available(p_code text, p_exclude uuid default null)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select upper(trim(p_code)) ~ '^[A-Z]{3}-[0-9]{3}$'
    and not exists (
      select 1 from public.mission_logs
      where code = upper(trim(p_code)) and (p_exclude is null or id <> p_exclude)
    );
$$;

grant execute on function public.get_mission_by_code(text) to anon, authenticated;
grant execute on function public.mission_code_available(text, uuid) to anon, authenticated;
