-- Levr 001: initial schema per docs/levr-requirements.md § Data model.
-- Single-user app: RLS is enabled with NO policies (deny-all for anon/authenticated).
-- All access goes through Next.js server code using the service-role key.
--
-- Apply with: npm run db:migrate  (reads DATABASE_URL from .env.local;
-- psql "$DATABASE_URL" -f <file> works too if psql is installed)

begin;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  business_id uuid references businesses(id) on delete set null,
  phone_number text,
  email text,
  preferred_channel text not null default 'sms'
    check (preferred_channel in ('sms', 'email', 'slack')),
  capability_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  name text not null,
  created_from_entry_id uuid, -- FK added below (circular with entries)
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  summary text, -- short line shown on Board (classifier output; falls back to text)
  business_id uuid references businesses(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  is_leverage boolean, -- null = unclassified / "needs a look"
  status text not null default 'open' check (status in ('open', 'done')),
  suggested_person_id uuid references people(id) on delete set null,
  source text not null default 'text' check (source in ('voice', 'text')),
  captured_at timestamptz not null default now(),
  done_at timestamptz
);

alter table projects
  add constraint projects_created_from_entry_fk
  foreign key (created_from_entry_id) references entries(id) on delete set null;

-- This table IS the per-person delegation history (Team profile queries it by
-- person_id). person_id survives as null if a person is removed, so an entry's
-- own record stays intact.
create table if not exists delegations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  expected_outcome text,
  actual_outcome text check (actual_outcome in ('done', 'late', 'not_done')),
  verdict text check (verdict in ('fully_trust', 'needs_coaching', 'pull_back')),
  outcome_note text,
  assigned_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Single-row app settings (single user, no accounts in v1).
create table if not exists app_settings (
  id boolean primary key default true check (id),
  user_name text not null default 'David',
  notifications_enabled boolean not null default true,
  slack_enabled boolean not null default false
);
insert into app_settings (id) values (true) on conflict do nothing;

create index if not exists entries_status_idx on entries (status, captured_at desc);
create index if not exists entries_business_idx on entries (business_id);
create index if not exists delegations_person_idx on delegations (person_id, assigned_at desc);
create index if not exists delegations_entry_idx on delegations (entry_id);

alter table businesses enable row level security;
alter table people enable row level security;
alter table projects enable row level security;
alter table entries enable row level security;
alter table delegations enable row level security;
alter table app_settings enable row level security;

insert into businesses (name) values
  ('True Home Acquisitions'),
  ('TC Dental Lab')
on conflict (name) do nothing;

commit;
