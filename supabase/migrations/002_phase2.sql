-- Levr 002: Phase 2 — consultant-grade classification
-- (checklists on delegated items, corrections log, Tier 2 revision state).
-- Apply with: npm run db:migrate

begin;

-- Ordered sub-steps on delegated entries (Tier 2 generated, user editable).
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_entry_idx on checklist_items (entry_id, sort_order);

-- User corrections of AI guesses (the inspectable "it learns about you" log).
-- entry-scoped rows for business/project/leverage/owner changes; person-scoped
-- rows (entry_id null) for capability-notes edits.
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references entries(id) on delete set null,
  person_id uuid references people(id) on delete set null,
  field text not null check (field in ('business', 'project', 'is_leverage', 'owner', 'capability_notes')),
  from_value text,
  to_value text,
  entry_text text, -- snapshot for prompt context, survives entry deletion
  created_at timestamptz not null default now()
);
create index if not exists corrections_created_idx on corrections (created_at desc);

-- Tier 2 outcome on the entry itself.
--   confirmed: Sonnet agreed with Tier 1 (or its changes were applied in place)
--   revised:   Sonnet changed classification and it was applied in place
--   flagged:   Sonnet disagrees but the user had already acted — surfaced, not applied
--   failed:    Tier 2 errored; entry stands as Tier 1 left it
alter table entries
  add column if not exists tier2_status text
    check (tier2_status in ('confirmed', 'revised', 'flagged', 'failed')),
  add column if not exists tier2_reason text,
  add column if not exists tier2_at timestamptz;

alter table checklist_items enable row level security;
alter table corrections enable row level security;

commit;
