-- ELITE MASTER upgrade
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text default 'Cadet',
  created_at timestamptz default now()
);

alter table public.agents enable row level security;

alter table public.certificates
  add column if not exists agent_id uuid references public.agents(id) on delete cascade;
