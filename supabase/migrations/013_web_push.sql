-- 013: Web Push (levr-web-push-handoff.md Phase 1) — a new, Dave-facing-only
-- notification channel from the installed PWA. Separate from the Twilio SMS
-- pipeline (lib/notify.ts), which this does not touch.

-- Single-user app, so this is realistically a 1-row table — kept as a table
-- rather than crammed into app_settings so a resubscribe (cleared cache, new
-- device) is an upsert-by-endpoint, not a schema change. `keys` holds the
-- PushSubscription's p256dh/auth values verbatim, as returned by the browser.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- Same "never spam" discipline as the SMS side (spec §Delegation
-- notifications) — a timestamp, not a boolean, so it's inspectable when a
-- reminder actually fired. Null = not sent yet.
alter table entries
  add column deadline_reminder_sent_at timestamptz;
