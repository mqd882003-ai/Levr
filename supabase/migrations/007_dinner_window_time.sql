-- Levr 007: give Dinner an explicit clock range so lib/notify.ts can actually
-- gate holds on it (it was start:null/end:null — accurate to what Dave gave
-- initially ("evening, ASAP after work"), but unenforceable by clock time).
-- Dave confirmed 18:00-19:30 as approximate, not a hard guarantee every day.
-- Apply with: npm run db:migrate

begin;

update personal_settings set
  protected_windows = $pw$[
    {"label":"Sleep","start":"22:00","end":"05:30","frequency":"daily","silent":true,"note":"sometimes extends to 06:00"},
    {"label":"Midday check-in","start":null,"end":null,"frequency":"daily","silent":false,"type":"reminder","note":"Prompt to talk to wife, midday"},
    {"label":"Gym","start":"16:00","end":"17:00","frequency":"4-5x/week","silent":true,"note":"~2hr window including drive time; floats"},
    {"label":"Dinner","start":"18:00","end":"19:30","frequency":"daily","silent":true,"note":"With wife, every night, ASAP after work; approximate, not a hard guarantee every day"},
    {"label":"Church","start":null,"end":null,"frequency":"Sundays","silent":true,"non_negotiable":true}
  ]$pw$::jsonb,
  notification_quiet_hours = $qh${
    "default": {"start":"22:00","end":"05:30"},
    "exceptions": [
      {"label":"Gym","start":"16:00","end":"17:00"},
      {"label":"Dinner","start":"18:00","end":"19:30"},
      {"label":"Church","start":null,"end":null}
    ]
  }$qh$::jsonb
where id = true;

commit;
