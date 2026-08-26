-- Levr 004: Personal + business branch config (per HANDOFF-personal-config-import.md,
-- decisions 1 and 2b). Schema only — seed data (Dave's actual protected windows,
-- business branch answers) is a separate build task, not part of this migration.
-- Apply with: npm run db:migrate

begin;

-- Single-row Personal branch settings (single user, mirrors app_settings).
-- Read by the classifier (is now protected time?) and lib/notify.ts (hold sends
-- unless flagged urgent).
create table if not exists personal_settings (
  id boolean primary key default true check (id),
  protected_windows jsonb not null default '[]',
    -- array of { label, start, end, frequency, silent }
  override_rule text not null default '',
    -- human-readable rule the Sonnet tier reasons against: when a business
    -- matter is allowed to interrupt a protected window at all
  notification_rule text not null default '',
    -- human-readable rule lib/notify.ts follows: how to behave (hold/flag)
    -- once inside a protected window, distinct from override_rule's
    -- "should this interrupt" judgment call
  notification_quiet_hours jsonb not null default '{}'
    -- { default: { start, end } | null, exceptions: [{ label, start, end }] }
);
insert into personal_settings (id) values (true) on conflict do nothing;
alter table personal_settings enable row level security;

-- One row per business: the "company profile" object businesses lacked.
-- project_type lives here (not on businesses) to keep businesses limited to
-- identity + FK relationships.
create table if not exists business_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  project_type text not null default 'delegatable'
    check (project_type in ('delegatable', 'personal_project')),
  vision_goal text not null default '',
  current_friction text not null default '',
  priority_fixes jsonb not null default '[]', -- array of short strings
  role_breakdown text not null default '',
  freeform_notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists business_settings_business_idx on business_settings (business_id);
alter table business_settings enable row level security;

-- Danny's multi-stage delegation lifecycle. Nullable: only businesses that use
-- a staged pipeline (not every delegation) set this; verdict still applies at
-- resolution regardless of stage.
alter table delegations
  add column if not exists stage text
    check (stage in ('assigned', 'contacted', 'appointment_set', 'closed', 'lost'));

commit;
