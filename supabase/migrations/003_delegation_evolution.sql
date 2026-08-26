-- Levr 003: Delegation Evolution addendum (approved 2026-08-25).
-- A1 needs no schema (people.phone_number already nullable).
-- Apply with: npm run db:migrate

begin;

-- A3.1: category vocabulary — fixed starter set that grows via Review-approved
-- proposals (status 'proposed' rows are classifier suggestions awaiting Dave).
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active' check (status in ('active', 'proposed')),
  created_at timestamptz not null default now()
);
alter table categories enable row level security;

-- Starter list drawn from Dave's real task mix (real-estate acquisitions +
-- dental lab: seller calls, showings/lockboxes/MLS, CRM uploads, postcards,
-- supply orders, closing paperwork).
insert into categories (name) values
  ('Cold calls'),
  ('Client-facing'),
  ('CRM & data entry'),
  ('Scheduling'),
  ('Listings & showings'),
  ('Ordering & supplies'),
  ('Paperwork & filings'),
  ('Marketing & mailers')
on conflict (name) do nothing;

-- Entry-side: category inferred at classification; parked_until for A6's
-- "Not now" (parked items leave the decay pool until this passes).
alter table entries
  add column if not exists category text,
  add column if not exists parked_until timestamptz;

-- Delegation-side:
--   category      — copied from the entry at closeout (A3.1)
--   confirm_first — A5 escalation toggle, off by default
--   diagnosis     — A4 closeout chip; only not_ready / no_follow_through
--                   count as trust evidence
--   flag_shown    — A3.6: the trust flag visible when Dave assigned anyway
alter table delegations
  add column if not exists category text,
  add column if not exists confirm_first boolean not null default false,
  add column if not exists diagnosis text
    check (diagnosis in ('unclear_brief', 'not_ready', 'bandwidth', 'blocked', 'no_follow_through')),
  add column if not exists flag_shown text;

-- A2: auto-notes phase-in toggle, off until Dave trusts the signal.
alter table app_settings
  add column if not exists auto_notes boolean not null default false;

commit;
