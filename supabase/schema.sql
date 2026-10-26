-- Выполните этот код в Supabase: SQL Editor → New query → Run

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  contact text not null check (char_length(contact) between 5 and 80),
  source text check (char_length(source) <= 200)
);

alter table public.leads enable row level security;

-- Сайт (ключ anon) может ТОЛЬКО добавлять заявки, читать их нельзя
drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads"
  on public.leads for insert
  to anon
  with check (true);

-- Заявки смотрите в Supabase: Table Editor → leads
