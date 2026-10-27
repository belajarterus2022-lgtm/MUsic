-- =====================================================================
--  Live Music Player — struktur database
--  Jalankan SEKALI di Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists folders_user_name_uq on public.folders (user_id, lower(name));

create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id  uuid not null references public.folders(id) on delete cascade,
  song_key   text not null,
  song       jsonb not null,
  created_at timestamptz not null default now(),
  unique (folder_id, song_key)
);
create index if not exists favorites_user_idx on public.favorites (user_id);

-- Row Level Security: setiap akun hanya bisa melihat & mengubah datanya sendiri
alter table public.folders   enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "folders milik sendiri" on public.folders;
create policy "folders milik sendiri" on public.folders
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "favorit milik sendiri" on public.favorites;
create policy "favorit milik sendiri" on public.favorites
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid())
  );

grant select, insert, update, delete on public.folders, public.favorites to authenticated;
