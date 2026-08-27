-- Levr 011: Routing junction + capacity model (routing-junction-handoff.md).
-- Recommendation engine only — assigning an owner stays a deliberate user
-- action (requirements.md); nothing here auto-assigns.
-- Apply with: npm run db:migrate

begin;

-- Capacity: one blended number per person for v1 (decision 2026-08-27).
-- NULL = no limit set — adding this column changes nothing until Dave sets a
-- limit on a person, so the junction can ship without silently capping anyone.
alter table people
  add column if not exists capacity_limit integer
    check (capacity_limit is null or capacity_limit > 0);

-- Routing recommendations become inspectable rows, not a fire-and-forget
-- suggested_person_id. accepted stays null until a human acts in AssignSheet:
-- true = confirmed the top pick, false = overrode (overridden_to_person_id
-- says to whom). This is the routing-equivalent of the corrections table.
create table if not exists routing_recommendations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references entries(id) on delete cascade,
  recommended_person_id uuid references people(id) on delete set null,
  score numeric,
  reasons jsonb,
  accepted boolean,
  overridden_to_person_id uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table routing_recommendations enable row level security;

-- Override logging + "did Dave take the suggestion" lookups are per-entry.
create index if not exists routing_recommendations_entry_idx
  on routing_recommendations (entry_id);

-- Cold-start fix: declared (Dave's opinion, from add-time capability scope or
-- manual edit) vs earned (derived from real outcomes via trust.ts once the
-- floor of 3 is crossed) ratings per category. capability_notes stays the
-- freeform human-readable version; this is its tagged, queryable shadow.
create table if not exists person_category_ratings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  level text not null check (level in ('not_ready', 'learning', 'capable', 'strong')),
  source text not null check (source in ('declared', 'earned')),
  updated_at timestamptz not null default now(),
  -- One current rating per person/category/source — updates upsert in place.
  unique (person_id, category_id, source)
);
alter table person_category_ratings enable row level security;

commit;
