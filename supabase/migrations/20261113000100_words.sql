-- The word deck. Everyone can read it, signed in or not; only the Supabase dashboard
-- (Table Editor or SQL Editor) can change it, as no write policies exist.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.topics (
  id       bigint generated always as identity primary key,
  name     text    not null unique check (name <> ''),
  -- Shown above the topic's words, e.g. how verbs are listed in dictionaries.
  note     text,
  -- Topics are shown in ascending order.
  position integer not null default 0
);

create table if not exists public.words (
  id        bigint generated always as identity primary key,
  topic_id  bigint not null references public.topics (id) on delete cascade,
  -- The Maltese word is the key for saved progress: changing its spelling resets progress for it.
  mt        text not null unique check (mt <> ''),
  -- Every translation is unique, so every question has exactly one answer.
  pl        text not null unique check (pl <> ''),
  en        text not null unique check (en <> ''),
  -- Words are shown in ascending order within their topic.
  position  integer not null default 0,
  -- On a plural form: the Maltese singular. The plural is shown right after it, in its topic.
  plural_of text references public.words (mt) on update cascade on delete cascade,
  -- On a conjugated verb form: the dictionary form of the verb (a word in this table).
  form_of   text references public.words (mt) on update cascade on delete cascade,
  check (plural_of is null or form_of is null),
  check (plural_of is distinct from mt and form_of is distinct from mt)
);

-- A singular has at most one plural.
create unique index if not exists words_one_plural on public.words (plural_of) where plural_of is not null;
create index if not exists words_topic on public.words (topic_id, position);

alter table public.topics enable row level security;
alter table public.words enable row level security;

drop policy if exists "anyone reads topics" on public.topics;
create policy "anyone reads topics" on public.topics for select to anon, authenticated using (true);

drop policy if exists "anyone reads words" on public.words;
create policy "anyone reads words" on public.words for select to anon, authenticated using (true);
