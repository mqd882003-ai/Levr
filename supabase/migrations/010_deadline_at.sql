-- 010: Calendar support — machine-readable deadline beside the verbatim text.
--
-- explicit_deadline stays the untouched record of what was said (spec:
-- "literal deadline text, never inferred"). deadline_at is the derived
-- interpretation, parsed ONCE at classify-save time by chrono-node anchored
-- to captured_at — never re-parsed at render time, so "next tuesday" keeps
-- meaning the Tuesday after capture forever. Null = unparseable/vague
-- ("before yana rolls it out") — those surface in Calendar's undated strip.
-- deadline_all_day distinguishes "by friday" (all-day chip) from "by 2pm"
-- (timed block).

alter table entries
  add column deadline_at timestamptz,
  add column deadline_all_day boolean not null default false;

-- Week-range lookups only ever want dated rows.
create index entries_deadline_at_idx on entries (deadline_at)
  where deadline_at is not null;
