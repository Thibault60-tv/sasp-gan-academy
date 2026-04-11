create extension if not exists pgcrypto;

create table if not exists public.applications (
  id bigint generated always as identity primary key,
  candidate_name text not null,
  candidate_age text,
  candidate_discord text not null,
  candidate_motivation text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.action_logs (
  id bigint generated always as identity primary key,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text default 'Cadet',
  created_at timestamptz default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  name text not null,
  date text,
  signature text,
  created_at timestamptz default now()
);

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text default 'ChangeMe123!',
  role text not null default 'accueil',
  created_at timestamptz default now()
);

alter table public.applications enable row level security;
alter table public.action_logs enable row level security;
alter table public.agents enable row level security;
alter table public.certificates enable row level security;
alter table public.admin_accounts enable row level security;
