-- madprompter database setup. Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.scripts (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled script',
  body        text not null default '',
  created_at  bigint not null,             -- milliseconds since epoch, set by the app
  updated_at  bigint not null,             -- used for "newest edit wins" sync
  deleted     boolean not null default false
);

create index if not exists scripts_user_idx on public.scripts (user_id, updated_at desc);

-- Every person can only see and change their own scripts.
alter table public.scripts enable row level security;

drop policy if exists "own scripts: read" on public.scripts;
create policy "own scripts: read" on public.scripts
  for select using (auth.uid() = user_id);

drop policy if exists "own scripts: insert" on public.scripts;
create policy "own scripts: insert" on public.scripts
  for insert with check (auth.uid() = user_id);

drop policy if exists "own scripts: update" on public.scripts;
create policy "own scripts: update" on public.scripts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Room for subscriptions later: one row per account with its plan.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  plan       text not null default 'pro',     -- free | pro | team (see app/js/plans.js)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile: read" on public.profiles;
create policy "own profile: read" on public.profiles
  for select using (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
