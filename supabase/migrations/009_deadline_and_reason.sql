-- Levr 009: Tier 1 multi-chunk classification adds two strict, never-inferred
-- fields per chunk. mentioned_people (from migration 008) is reused as-is —
-- no new column for that; Tier 1 writes strict/explicit names into it at
-- capture time, Tier 2's existing pass now merges its own looser suggestions
-- into the same array instead of overwriting it.
-- DRAFT — do not apply until reviewed.
-- Apply with: npm run db:migrate

begin;

alter table entries
  add column if not exists explicit_deadline text, -- literal deadline text as stated, or null — never inferred
  add column if not exists stated_reason text;      -- short quote of an explicitly given reason, or null — never inferred

commit;
