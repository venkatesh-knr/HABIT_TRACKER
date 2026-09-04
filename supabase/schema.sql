-- Ritual — full schema, idempotent.
-- Safe to run repeatedly against an existing project: every statement either
-- guards with "if not exists" or replaces in place.
-- Run in: Supabase dashboard -> SQL Editor -> New query -> Run.

-- ---------------------------------------------------------------------------
-- profiles: one row per user, mirroring auth.users 1:1
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Friend',
  avatar_emoji text not null default '🌱',
  timezone text not null default 'UTC',
  age_range text,
  gender text,
  created_at timestamptz not null default now()
);

-- added separately so this file also upgrades an older profiles table
alter table public.profiles add column if not exists age_range text;
alter table public.profiles add column if not exists gender text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_age_range_check') then
    alter table public.profiles add constraint profiles_age_range_check
      check (age_range is null or age_range in ('18-29', '30-44', '45-59', '60+'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_check') then
    alter table public.profiles add constraint profiles_gender_check
      check (gender is null or gender in ('male', 'female', 'prefer_not_to_say'));
  end if;
end $$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
-- insert policy exists so accounts created BEFORE this table can self-provision
-- on next sign-in; the primary key makes a duplicate impossible.
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- auto-create a profile the instant someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  schedule text not null default 'daily' check (schedule in ('daily', 'weekdays', 'custom')),
  color text not null default '#3F6C51',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- per-habit goals (added after the first build)
alter table public.habits add column if not exists target_type text not null default 'boolean';
alter table public.habits add column if not exists target_value integer;
alter table public.habits add column if not exists target_unit text;

-- ---------------------------------------------------------------------------
-- habit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

alter table public.habit_logs add column if not exists value integer;

-- ---------------------------------------------------------------------------
-- Row-Level Security: a user can only ever see or touch their own rows
-- ---------------------------------------------------------------------------
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "habits_select_own" on public.habits;
drop policy if exists "habits_insert_own" on public.habits;
drop policy if exists "habits_update_own" on public.habits;
drop policy if exists "habits_delete_own" on public.habits;

create policy "habits_select_own" on public.habits for select using (auth.uid() = user_id);
create policy "habits_insert_own" on public.habits for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on public.habits for update using (auth.uid() = user_id);
create policy "habits_delete_own" on public.habits for delete using (auth.uid() = user_id);

drop policy if exists "logs_select_own" on public.habit_logs;
drop policy if exists "logs_insert_own" on public.habit_logs;
drop policy if exists "logs_update_own" on public.habit_logs;
drop policy if exists "logs_delete_own" on public.habit_logs;

create policy "logs_select_own" on public.habit_logs for select using (auth.uid() = user_id);
create policy "logs_insert_own" on public.habit_logs for insert with check (auth.uid() = user_id);
create policy "logs_update_own" on public.habit_logs for update using (auth.uid() = user_id);
create policy "logs_delete_own" on public.habit_logs for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Guard: don't allow logging days that haven't happened yet.
-- One day of slack, deliberately: the client writes its own local date, and a
-- user east of the server can legitimately be a few hours into "tomorrow".
-- This still blocks paging forward a week to manufacture a streak.
-- ---------------------------------------------------------------------------
create or replace function public.reject_future_logs()
returns trigger
language plpgsql
as $$
begin
  if new.log_date > (current_date + 1) then
    raise exception 'Cannot log a habit for a future date (%).', new.log_date;
  end if;
  return new;
end;
$$;

drop trigger if exists habit_logs_no_future on public.habit_logs;
create trigger habit_logs_no_future
  before insert or update on public.habit_logs
  for each row execute function public.reject_future_logs();

-- ---------------------------------------------------------------------------
-- Streak calculation, server-side, in the caller's own timezone.
-- ---------------------------------------------------------------------------
create or replace function public.get_streak_summary(p_habit_id uuid)
returns table(current_streak integer, longest_streak integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
begin
  select timezone into v_timezone from profiles where id = v_user_id;
  v_today := (now() at time zone coalesce(v_timezone, 'UTC'))::date;

  return query
  with completed_days as (
    select log_date
    from habit_logs
    where habit_id = p_habit_id
      and user_id = v_user_id
      and completed = true
      and log_date <= v_today
  ),
  grouped as (
    select
      log_date,
      log_date - (row_number() over (order by log_date))::int * interval '1 day' as grp
    from completed_days
  ),
  streaks as (
    select min(log_date) as streak_start, max(log_date) as streak_end, count(*) as streak_length
    from grouped
    group by grp
  )
  select
    coalesce((select streak_length::int from streaks
              where streak_end >= v_today - interval '1 day'
              order by streak_end desc limit 1), 0),
    coalesce((select max(streak_length)::int from streaks), 0);
end;
$$;

grant execute on function public.get_streak_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Same streak calculation as get_streak_summary, but for every one of the
-- caller's habits in a single round trip instead of one call per habit.
-- ---------------------------------------------------------------------------
create or replace function public.get_all_streak_summaries()
returns table(habit_id uuid, current_streak integer, longest_streak integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
begin
  select timezone into v_timezone from profiles where id = v_user_id;
  v_today := (now() at time zone coalesce(v_timezone, 'UTC'))::date;

  return query
  with completed_days as (
    select l.habit_id, l.log_date
    from habit_logs l
    where l.user_id = v_user_id
      and l.completed = true
      and l.log_date <= v_today
  ),
  grouped as (
    select
      cd.habit_id,
      cd.log_date,
      cd.log_date - (row_number() over (partition by cd.habit_id order by cd.log_date))::int * interval '1 day' as grp
    from completed_days cd
  ),
  streaks as (
    select g.habit_id, max(g.log_date) as streak_end, count(*) as streak_length
    from grouped g
    group by g.habit_id, g.grp
  ),
  current_streaks as (
    select distinct on (s.habit_id) s.habit_id, s.streak_length::int as current_streak
    from streaks s
    where s.streak_end >= v_today - interval '1 day'
    order by s.habit_id, s.streak_end desc
  ),
  longest_streaks as (
    select s.habit_id, max(s.streak_length)::int as longest_streak
    from streaks s
    group by s.habit_id
  )
  select h.id, coalesce(c.current_streak, 0), coalesce(l.longest_streak, 0)
  from habits h
  left join current_streaks c on c.habit_id = h.id
  left join longest_streaks l on l.habit_id = h.id
  where h.user_id = v_user_id;
end;
$$;

grant execute on function public.get_all_streak_summaries() to authenticated;
