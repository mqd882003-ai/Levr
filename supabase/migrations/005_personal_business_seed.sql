-- Levr 005: seed Dave's actual Personal + business branch data (per
-- HANDOFF-personal-config-import.md task 2). Depends on 004's tables.
-- Idempotent: safe to re-run if any of these values are corrected later.
-- Apply with: npm run db:migrate

begin;

-- New personal_project businesses (delegatable ones already seeded in 001).
insert into businesses (name) values
  ('3D Scan'),
  ('Backtesting')
on conflict (name) do nothing;

-- Personal branch.
update personal_settings set
  protected_windows = $pw$[
    {"label":"Sleep","start":"22:00","end":"05:30","frequency":"daily","silent":true,"note":"sometimes extends to 06:00"},
    {"label":"Midday check-in","start":null,"end":null,"frequency":"daily","silent":false,"type":"reminder","note":"Prompt to talk to wife, midday"},
    {"label":"Gym","start":"16:00","end":"17:00","frequency":"4-5x/week","silent":true,"note":"~2hr window including drive time; floats"},
    {"label":"Dinner","start":null,"end":null,"frequency":"daily","silent":true,"note":"With wife, every night, ASAP after work"},
    {"label":"Church","start":null,"end":null,"frequency":"Sundays","silent":true,"non_negotiable":true}
  ]$pw$::jsonb,
  override_rule = $or$Business only interrupts a protected window if genuinely time-sensitive (real deadline/deal at risk). Delegation checked first — Danny/Stella/Chi considered before it lands on Dave.$or$,
  notification_rule = $nr$Hold silently during protected windows unless truly time-sensitive, then flag.$nr$,
  notification_quiet_hours = $qh${
    "default": {"start":"22:00","end":"05:30"},
    "exceptions": [
      {"label":"Gym","start":"16:00","end":"17:00"},
      {"label":"Dinner","start":null,"end":null},
      {"label":"Church","start":null,"end":null}
    ]
  }$qh$::jsonb
where id = true;

-- Business branches.
insert into business_settings (business_id, project_type, vision_goal, current_friction, priority_fixes, role_breakdown, freeform_notes)
select id, 'delegatable',
  $v$Replace TC Dental Lab as primary income. Wholesale now, grow toward flipping 5 properties.$v$,
  $f$Lead pipeline dry 3 months — lead-gen problem, not Danny's performance.$f$,
  $p$["Shift from cold calling to Facebook ads for warmer inbound"]$p$::jsonb,
  $r$Dave: ops, deal analysis, closing warm leads, runs FB ads personally. Danny: works warm leads once flowing — call, convert to appointment, work toward close.$r$,
  $n$Danny success = volume → appointment conversion → closed deal (multi-stage, tracked via delegations.stage).$n$
from businesses where name = 'True Home Acquisitions'
on conflict (business_id) do update set
  project_type = excluded.project_type,
  vision_goal = excluded.vision_goal,
  current_friction = excluded.current_friction,
  priority_fixes = excluded.priority_fixes,
  role_breakdown = excluded.role_breakdown,
  freeform_notes = excluded.freeform_notes;

insert into business_settings (business_id, project_type, vision_goal, current_friction, priority_fixes, role_breakdown, freeform_notes)
select id, 'delegatable',
  $v$Stabilize and run smoother — profit and better systems, not growth-at-all-costs.$v$,
  $f$Lost 25% of gross (biggest client), recovered to 13-15% new business. Overstaffed relative to workload. Monday meetings + 11:30 huddles inconsistent — follow-through gap, not a system gap.$f$,
  $p$["meeting/huddle accountability", "right-size staff to workload"]$p$::jsonb,
  $r$Dave: ops/marketing/management (CFO/CMO-level), ~2hrs/day lab work, TSI visits few hrs/week. Partner: strong at team motivation, weak at delegation structuring — Dave backfills.$r$,
  $n$AP/AR controlled by partner's wife, no visibility for Dave — parked, not part of 80/20 structure. Procurement is a strength, don't touch. Seattle lab acquisition (10 people, weaker structure) stays nested under TC, no separate business_id.$n$
from businesses where name = 'TC Dental Lab'
on conflict (business_id) do update set
  project_type = excluded.project_type,
  vision_goal = excluded.vision_goal,
  current_friction = excluded.current_friction,
  priority_fixes = excluded.priority_fixes,
  role_breakdown = excluded.role_breakdown,
  freeform_notes = excluded.freeform_notes;

insert into business_settings (business_id, project_type, vision_goal, current_friction, priority_fixes, role_breakdown, freeform_notes)
select id, 'personal_project',
  $v$Dave's personal IP. TC is a testing ground only, not an owner. Grow it or sell/exit it.$v$,
  $f$Time constraint — couple hrs/week when available, not technical blockers.$f$,
  $p$["Steady phase-by-phase progress; no app-building (Phase 6) until Phase 4 gives a real measured accuracy number"]$p$::jsonb,
  '',
  $n$6-phase plan: 1) prove photo→mesh pipeline, 2) scale ref (Track A) or fiducial markers (Track B), 3) camera calibration, 4) measure real error vs ground-truth, 5) tune Track B for dental scan-body geometry, 6) build app. Track B (fiducial-only pose estimation, ~10-15µm) is the one relevant to dental, not Track A (dense mesh, ~150-200µm).$n$
from businesses where name = '3D Scan'
on conflict (business_id) do update set
  project_type = excluded.project_type,
  vision_goal = excluded.vision_goal,
  current_friction = excluded.current_friction,
  priority_fixes = excluded.priority_fixes,
  role_breakdown = excluded.role_breakdown,
  freeform_notes = excluded.freeform_notes;

insert into business_settings (business_id, project_type, vision_goal, current_friction, priority_fixes, role_breakdown, freeform_notes)
select id, 'personal_project',
  $v$strategy → backtest → refine → forward-test (paper, ~couple months) → live$v$,
  $f$Early stage, no technical blockers — time consumed by True Home CRM work up to now.$f$,
  $p$["Steady movement through strategy → backtest → refine loop"]$p$::jsonb,
  '',
  $n$Priority order: Backtesting first, 3D Scan gets leftover downtime hours.$n$
from businesses where name = 'Backtesting'
on conflict (business_id) do update set
  project_type = excluded.project_type,
  vision_goal = excluded.vision_goal,
  current_friction = excluded.current_friction,
  priority_fixes = excluded.priority_fixes,
  role_breakdown = excluded.role_breakdown,
  freeform_notes = excluded.freeform_notes;

commit;
