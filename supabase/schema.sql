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

-- ---------- Missions ----------

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

-- Mission codes (ABC-123): the invite code for joining. Upgrades older setups without codes.
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

-- Status: 'open' or 'complete'. Completed missions are visible to everyone.
alter table public.mission_logs add column if not exists status text not null default 'open';
alter table public.mission_logs drop constraint if exists mission_logs_status_check;
alter table public.mission_logs add constraint mission_logs_status_check check (status in ('open', 'complete'));
alter table public.mission_logs add column if not exists completed_at timestamptz;
create index if not exists mission_logs_completed_idx on public.mission_logs (completed_at desc) where status = 'complete';

-- Visibility: 'public' missions show up when browsing; 'unlisted' ones are reachable only by code.
-- Missions that existed before this column become unlisted, so nothing private goes public.
alter table public.mission_logs add column if not exists visibility text not null default 'unlisted';
alter table public.mission_logs alter column visibility set default 'public';
alter table public.mission_logs drop constraint if exists mission_logs_visibility_check;
alter table public.mission_logs add constraint mission_logs_visibility_check check (visibility in ('public', 'unlisted'));
create index if not exists mission_logs_browse_idx on public.mission_logs (created_at desc) where visibility = 'public' and status = 'open';

-- Stamp edits on the server so clients can't fake them
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

-- ---------- Crew: people who joined a mission with its code ----------

create table if not exists public.mission_members (
  mission_id uuid not null references public.mission_logs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create index if not exists mission_members_user_idx on public.mission_members (user_id, joined_at desc);

-- ---------- Helper checks ----------
-- security definer so they can be used inside access rules without the rules looping into each other.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_mission_owner(p_mission uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.mission_logs where id = p_mission and owner_id = auth.uid());
$$;

create or replace function public.is_mission_member(p_mission uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.mission_members where mission_id = p_mission and user_id = auth.uid());
$$;

-- Author, admin or crew: the people allowed to see a mission's code
create or replace function public.is_mission_insider(p_mission uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.is_mission_owner(p_mission) or public.is_mission_member(p_mission) or public.is_admin();
$$;

-- ---------- Access rules (Row Level Security) ----------

alter table public.profiles enable row level security;
alter table public.mission_logs enable row level security;
alter table public.mission_members enable row level security;

-- Anyone can see usernames (they're shown on missions)
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles
  for select using (true);

-- Reading the missions table directly (which includes codes) is limited to the author, admins and crew.
-- Everyone else browses through browse_missions() / get_mission() below, which never return the code.
drop policy if exists "Missions are public" on public.mission_logs;
drop policy if exists "Completed missions are public" on public.mission_logs;
drop policy if exists "Authors and admins read missions" on public.mission_logs;
drop policy if exists "Insiders read missions" on public.mission_logs;
create policy "Insiders read missions" on public.mission_logs
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin() or public.is_mission_member(id));

-- Signed-in users can log missions as themselves; new missions always start open
drop policy if exists "Users log their own missions" on public.mission_logs;
create policy "Users log their own missions" on public.mission_logs
  for insert to authenticated with check (owner_id = auth.uid() and status = 'open');

-- Only the author (and admins) edit, complete or delete a mission
drop policy if exists "Authors and admins edit missions" on public.mission_logs;
create policy "Authors and admins edit missions" on public.mission_logs
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors and admins delete missions" on public.mission_logs;
create policy "Authors and admins delete missions" on public.mission_logs
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Crew rows: you see your own memberships, and authors see their crew. Joining goes through join_mission().
drop policy if exists "Members and authors read crew" on public.mission_members;
create policy "Members and authors read crew" on public.mission_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_mission_owner(mission_id) or public.is_admin());

-- Leave a mission yourself, or (as the author or an admin) remove someone from it
drop policy if exists "Leave or remove crew" on public.mission_members;
create policy "Leave or remove crew" on public.mission_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_mission_owner(mission_id) or public.is_admin());

-- No insert/update policies on profiles or mission_members: profiles come from the sign-up trigger,
-- crew rows from join_mission(), and is_admin is changed only in the dashboard (Table Editor -> profiles).

-- ---------- Reading missions ----------
-- Older versions of these functions returned different columns, so drop before recreating.

drop function if exists public.get_mission_by_code(text);
drop function if exists public.get_mission(uuid);
drop function if exists public.browse_missions(text);
drop function if exists public.get_mission_crew(uuid, text);

-- Browse public open missions ('open') or all completed missions ('complete'). Never includes codes.
create function public.browse_missions(p_status text)
returns table (
  id uuid, owner_id uuid, name text, target text, lat double precision, lon double precision, date date,
  objective text, status text, visibility text, completed_at timestamptz, created_at timestamptz,
  updated_at timestamptz, username text, crew_count int
)
language sql
stable
security definer set search_path = ''
as $$
  select m.id, m.owner_id, m.name, m.target, m.lat, m.lon, m.date, m.objective, m.status, m.visibility,
    m.completed_at, m.created_at, m.updated_at, p.username,
    (select count(*)::int from public.mission_members mm where mm.mission_id = m.id)
  from public.mission_logs m
  join public.profiles p on p.id = m.owner_id
  where m.status = p_status and (p_status = 'complete' or m.visibility = 'public')
  order by case when p_status = 'complete' then m.completed_at else m.created_at end desc
  limit 100;
$$;

-- One mission by id: public/completed missions for everyone, any mission for its insiders.
-- The code is only included for insiders.
create function public.get_mission(p_id uuid)
returns table (
  id uuid, owner_id uuid, code text, name text, target text, lat double precision, lon double precision, date date,
  objective text, status text, visibility text, completed_at timestamptz, created_at timestamptz,
  updated_at timestamptz, username text, crew_count int
)
language sql
stable
security definer set search_path = ''
as $$
  select m.id, m.owner_id,
    case when public.is_mission_insider(m.id) then m.code end,
    m.name, m.target, m.lat, m.lon, m.date, m.objective, m.status, m.visibility,
    m.completed_at, m.created_at, m.updated_at, p.username,
    (select count(*)::int from public.mission_members mm where mm.mission_id = m.id)
  from public.mission_logs m
  join public.profiles p on p.id = m.owner_id
  where m.id = p_id
    and (m.visibility = 'public' or m.status = 'complete' or public.is_mission_insider(m.id));
$$;

-- One mission by its exact code (you already know the code, so it's included)
create function public.get_mission_by_code(p_code text)
returns table (
  id uuid, owner_id uuid, code text, name text, target text, lat double precision, lon double precision, date date,
  objective text, status text, visibility text, completed_at timestamptz, created_at timestamptz,
  updated_at timestamptz, username text, crew_count int
)
language sql
stable
security definer set search_path = ''
as $$
  select m.id, m.owner_id, m.code, m.name, m.target, m.lat, m.lon, m.date, m.objective, m.status, m.visibility,
    m.completed_at, m.created_at, m.updated_at, p.username,
    (select count(*)::int from public.mission_members mm where mm.mission_id = m.id)
  from public.mission_logs m
  join public.profiles p on p.id = m.owner_id
  where m.code = upper(trim(p_code));
$$;

-- A mission's crew, for anyone who can see the mission (or who has its code)
create function public.get_mission_crew(p_mission uuid, p_code text default null)
returns table (user_id uuid, username text, joined_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select mm.user_id, p.username, mm.joined_at
  from public.mission_members mm
  join public.profiles p on p.id = mm.user_id
  join public.mission_logs m on m.id = mm.mission_id
  where mm.mission_id = p_mission
    and (
      m.visibility = 'public' or m.status = 'complete' or public.is_mission_insider(m.id)
      or m.code = upper(trim(coalesce(p_code, '')))
    )
  order by mm.joined_at;
$$;

-- ---------- Joining ----------

-- Join an open mission with its code. Returns the mission id.
create or replace function public.join_mission(p_code text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_mission public.mission_logs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a mission' using errcode = '42501';
  end if;
  select * into v_mission from public.mission_logs where code = upper(trim(p_code));
  if not found then
    raise exception 'No mission has that code' using errcode = 'P0002';
  end if;
  if v_mission.status <> 'open' then
    raise exception 'This mission is already complete' using errcode = 'P0001';
  end if;
  if v_mission.owner_id = auth.uid() then
    raise exception 'You lead this mission already' using errcode = 'P0001';
  end if;
  insert into public.mission_members (mission_id, user_id)
  values (v_mission.id, auth.uid())
  on conflict do nothing;
  return v_mission.id;
end;
$$;

-- ---------- Mission log: entries typed by the lead and crew ----------
-- Entries are permanent: there is no way to edit them, and they only disappear with their mission.

create table if not exists public.mission_entries (
  id bigint generated always as identity primary key,
  mission_id uuid not null references public.mission_logs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists mission_entries_mission_idx on public.mission_entries (mission_id, created_at);

-- Nobody reads or writes the table directly; it's reached only through the functions below
alter table public.mission_entries enable row level security;
revoke all on public.mission_entries from anon, authenticated;

-- Block edits outright, even from the dashboard
create or replace function public.forbid_entry_edits()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Mission log entries cannot be edited';
end;
$$;

drop trigger if exists mission_entries_no_update on public.mission_entries;
create trigger mission_entries_no_update
  before update on public.mission_entries
  for each row execute function public.forbid_entry_edits();

drop function if exists public.get_mission_entries(uuid, text);

-- Read a mission's log: anyone who can see the mission (or has its code)
create function public.get_mission_entries(p_mission uuid, p_code text default null)
returns table (id bigint, author_id uuid, username text, body text, created_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select e.id, e.author_id, p.username, e.body, e.created_at
  from public.mission_entries e
  join public.profiles p on p.id = e.author_id
  join public.mission_logs m on m.id = e.mission_id
  where e.mission_id = p_mission
    and (
      m.visibility = 'public' or m.status = 'complete' or public.is_mission_insider(m.id)
      or m.code = upper(trim(coalesce(p_code, '')))
    )
  order by e.created_at, e.id;
$$;

-- Add an entry: only the lead and crew, only while the mission is open
create or replace function public.add_mission_entry(p_mission uuid, p_body text)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_status text;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to write in the mission log' using errcode = '42501';
  end if;
  select status into v_status from public.mission_logs where id = p_mission;
  if not found then
    raise exception 'Mission not found' using errcode = 'P0002';
  end if;
  if not (public.is_mission_owner(p_mission) or public.is_mission_member(p_mission)) then
    raise exception 'Only the mission lead and crew can write in its log' using errcode = '42501';
  end if;
  if v_status <> 'open' then
    raise exception 'This mission is complete, so its log is closed' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write something first' using errcode = 'P0001';
  end if;
  if char_length(p_body) > 1000 then
    raise exception 'Entries can be up to 1000 characters' using errcode = 'P0001';
  end if;
  -- A little spam protection: one entry every 3 seconds per person
  if exists (
    select 1 from public.mission_entries
    where author_id = auth.uid() and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'Slow down: wait a moment before posting again' using errcode = 'P0001';
  end if;
  insert into public.mission_entries (mission_id, author_id, body)
  values (p_mission, auth.uid(), trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Codes ----------

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

grant execute on function public.browse_missions(text) to anon, authenticated;
grant execute on function public.get_mission(uuid) to anon, authenticated;
grant execute on function public.get_mission_by_code(text) to anon, authenticated;
grant execute on function public.get_mission_crew(uuid, text) to anon, authenticated;
grant execute on function public.join_mission(text) to authenticated;
grant execute on function public.get_mission_entries(uuid, text) to anon, authenticated;
grant execute on function public.add_mission_entry(uuid, text) to authenticated;
grant execute on function public.mission_code_available(text, uuid) to anon, authenticated;
