-- Mapa Mars database setup for Supabase.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

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
  name text not null check (char_length(trim(name)) between 1 and 80),
  target text not null check (char_length(trim(target)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  date date,
  objective text not null default '' check (char_length(objective) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists mission_logs_created_at_idx on public.mission_logs (created_at desc);

-- Stamp edits on the server so clients can't fake the time
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  new.owner_id := old.owner_id; -- missions can't be handed to someone else
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

-- Anyone (even signed out) can see usernames and missions
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles
  for select using (true);

drop policy if exists "Missions are public" on public.mission_logs;
create policy "Missions are public" on public.mission_logs
  for select using (true);

-- Signed-in users can log missions as themselves
drop policy if exists "Users log their own missions" on public.mission_logs;
create policy "Users log their own missions" on public.mission_logs
  for insert to authenticated with check (owner_id = auth.uid());

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
