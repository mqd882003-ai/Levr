-- Levr 006: delegation-notification lifecycle, per HANDOFF-personal-config-import.md
-- task 3. Tracks what happened to the single assignment message: sent as
-- normal, held because it fell inside one of Dave's protected windows and
-- Tier 2 didn't confirm urgency, skipped (notifications off / no contact
-- info), or failed (channel send error). Held rows are picked up later by
-- lib/notify.ts's flushHeldNotifications once the window closes naturally.
-- Apply with: npm run db:migrate

begin;

alter table delegations
  add column if not exists notify_status text
    check (notify_status in ('sent', 'held', 'skipped', 'failed')),
  add column if not exists notify_note text;

commit;
