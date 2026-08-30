-- Levr 012: Intent router (intent-router-handoff, 2026-08-28 final).
-- Tier 2 stops treating every capture as a task: it decides what kind of
-- thing this is first (task / person_note / outcome_report / consult /
-- decision), then only computes what that kind needs. Nothing here blocks
-- capture or writes real data automatically — every intent besides 'task'
-- ends in a tap-to-confirm.
-- Apply with: npm run db:migrate

begin;

alter table entries
  add column if not exists capture_intent text not null default 'task'
    check (capture_intent in ('task', 'person_note', 'outcome_report', 'consult', 'decision')),
  add column if not exists intent_status text
    check (intent_status is null
           or intent_status in ('processing', 'pending_confirm', 'confirmed', 'dismissed')),
  add column if not exists intent_person_id uuid references people(id) on delete set null,
  add column if not exists intent_delegation_id uuid references delegations(id) on delete set null,
  add column if not exists intent_payload text,
  add column if not exists intent_evidence text;

-- Gap 2: confirmed name→person answers become aliases. Only ever written from
-- a tap on the confirm chip, and only trusted as a CANDIDATE on later
-- captures — the ask-don't-guess rule re-verifies against the live roster
-- every time, so a stored shortcut can't silently drift wrong.
create table if not exists person_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_text text not null,
  person_id uuid not null references people(id) on delete cascade,
  confirmed_at timestamptz not null default now()
);
alter table person_aliases enable row level security;

create index if not exists person_aliases_alias_idx on person_aliases (lower(alias_text));

commit;
