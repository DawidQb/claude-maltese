-- One row of saved progress per signed-in user.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- The app's progress (cards, streak, daily counts, game records); settings stay on each device.
  data       jsonb       not null,
  -- Bumped on every write, so two devices saving at once cannot overwrite each other.
  version    integer     not null default 1,
  -- Bumped by Reset and Import, so other devices drop their old cards instead of merging them back.
  generation integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Each user sees and changes only their own row.
drop policy if exists "read own progress" on public.progress;
create policy "read own progress" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert own progress" on public.progress;
create policy "insert own progress" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update own progress" on public.progress;
create policy "update own progress" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "delete own progress" on public.progress;
create policy "delete own progress" on public.progress
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.progress_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.progress_touch();
