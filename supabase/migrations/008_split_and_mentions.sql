-- Levr 008: two Tier 2 capabilities Dave asked for after testing HANDOFF
-- task 4 with a real multi-topic capture:
--   1. Splitting one capture that actually spans multiple businesses into
--      separate entries (split_from_entry_id traces the split back).
--   2. Suggesting people mentioned in the text who aren't in Team yet
--      (mentioned_people) — a dismissible hint, never an auto-create.
-- Apply with: npm run db:migrate

begin;

alter table entries
  add column if not exists split_from_entry_id uuid references entries(id) on delete set null,
  add column if not exists mentioned_people jsonb not null default '[]';

create index if not exists entries_split_from_idx on entries (split_from_entry_id);

commit;
