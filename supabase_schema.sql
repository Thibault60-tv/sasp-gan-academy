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

alter table public.applications enable row level security;
alter table public.action_logs enable row level security;
