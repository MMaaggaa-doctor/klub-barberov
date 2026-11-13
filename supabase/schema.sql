-- ============================================================
--  Клуб Барберов — база Supabase
--  Выполните ВЕСЬ этот код: SQL Editor → New query → Run
-- ============================================================

-- 1. Заявки с формы -------------------------------------------------
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  contact text not null check (char_length(contact) between 5 and 80),
  source text check (char_length(source) <= 200)
);
alter table public.leads add column if not exists ref text check (char_length(ref) <= 60);

-- 2. Администраторы -------------------------------------------------
create table if not exists public.admins (email text primary key);

-- !!! ЗАМЕНИТЕ на свою почту (ту, с которой войдёте в админку) и запустите:
-- insert into public.admins (email) values ('ВАША_ПОЧТА@example.com');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 3. Партнёры (UGC) -------------------------------------------------
create table if not exists public.partners (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. Переходы по партнёрским ссылкам --------------------------------
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  partner_slug text not null check (partner_slug ~ '^[a-z0-9_-]{2,40}$'),
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  path text check (char_length(path) <= 200)
);
create index if not exists visits_slug_created_idx on public.visits (partner_slug, created_at);
create index if not exists leads_ref_idx on public.leads (ref);

create or replace function public.partner_is_active(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partners where slug = p_slug and active);
$$;

-- 5. Права (RLS) ----------------------------------------------------
alter table public.leads    enable row level security;
alter table public.partners enable row level security;
alter table public.visits   enable row level security;
alter table public.admins   enable row level security;

drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads" on public.leads
  for insert to anon, authenticated with check (true);

drop policy if exists "admin reads leads" on public.leads;
create policy "admin reads leads" on public.leads
  for select to authenticated using (public.is_admin());

drop policy if exists "admin manages partners" on public.partners;
create policy "admin manages partners" on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site records visits" on public.visits;
create policy "site records visits" on public.visits
  for insert to anon, authenticated with check (public.partner_is_active(partner_slug));

drop policy if exists "admin reads visits" on public.visits;
create policy "admin reads visits" on public.visits
  for select to authenticated using (public.is_admin());

drop policy if exists "admin reads admins" on public.admins;
create policy "admin reads admins" on public.admins
  for select to authenticated using (public.is_admin());

grant execute on function public.partner_is_active(text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- 6. Статистика для админки ----------------------------------------
create or replace function public.partner_stats(p_days int default null)
returns table (slug text, visits bigint, uniques bigint, leads bigint)
language sql stable as $$
  select p.slug,
         coalesce(v.visits, 0), coalesce(v.uniques, 0), coalesce(l.leads, 0)
  from public.partners p
  left join (
    select partner_slug, count(*) as visits, count(distinct visitor_id) as uniques
    from public.visits
    where p_days is null or created_at >= now() - make_interval(days => p_days)
    group by partner_slug
  ) v on v.partner_slug = p.slug
  left join (
    select ref, count(*) as leads
    from public.leads
    where ref is not null and (p_days is null or created_at >= now() - make_interval(days => p_days))
    group by ref
  ) l on l.ref = p.slug;
$$;

create or replace function public.partner_daily(p_days int default 30)
returns table (slug text, day date, visits bigint)
language sql stable as $$
  select partner_slug, (created_at at time zone 'Europe/Moscow')::date, count(*)
  from public.visits
  where created_at >= now() - make_interval(days => p_days)
  group by 1, 2;
$$;

grant execute on function public.partner_stats(int) to authenticated;
grant execute on function public.partner_daily(int) to authenticated;
