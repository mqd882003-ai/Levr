-- 014: Web Push Phases 2/3 — A6 decay push needs its own "already notified"
-- marker, separate from deadline_reminder_sent_at (013), since an entry can
-- independently qualify for either or both. Same "timestamp, not boolean"
-- convention as 013 — inspectable, null = not sent yet.
alter table entries
  add column decay_notified_at timestamptz;
