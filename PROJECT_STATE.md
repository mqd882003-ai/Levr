# Levr — Project State

> Backup of build state and session knowledge. Update at the end of each working session.
> Last updated: **2026-08-25** (after Board pass + design polish pass).

## What this project is

Capture-and-delegate mobile-web PWA for Dave. Talk/type a thought on Home → server classifies it
(business / project / 20%-vs-80% / suggested owner) → it lands on Board → delegated items get an
owner, and closing them out builds each person's delegation history on Team.

- Specs: `docs/levr-requirements.md` (structure/data — wins conflicts) + `docs/DESIGN.md` (visuals).
- Reference: `reference/levr-app-v2.html` (approved prototype; v1 superseded, both throwaway).
- Build order agreed with Dave: **Home → Board → Team → Settings**, stopping after each screen for review.

## Stack

- Next.js **16.3.2** (App Router) + TypeScript + Tailwind 4 (tokens live in `app/globals.css`, not Tailwind config)
- Supabase (existing project) — Postgres + PostgREST; **all DB access is server-side** via service-role key
  (RLS enabled with zero policies = anon deny-all)
- Anthropic `claude-haiku-4-5-20251001` for classification (pinned by spec; server-only)
- Fonts self-hosted via `next/font`: Space Grotesk (display), Inter (body), JetBrains Mono (mono)
- Deploy target: Vercel (NOT set up yet)

## Build status by screen

| Screen | Status |
|---|---|
| Home (greeting + capture + classify) | ✅ Built, live-tested end-to-end |
| Board (sections, pulse, chips, sheets, closeout) | ✅ Built, live-tested end-to-end |
| Team (cards, profile+history, add/edit) | ✅ Built, live-tested end-to-end |
| Settings (name, businesses, toggles, channels, data) | ✅ Built, live-tested end-to-end |
| Phase 2: Tier 2 pipeline + checklists + corrections + Review with me | ✅ Built (migration 002), live-tested end-to-end |
| Delegation notifications (SMS/email/Slack send) | ⬜ Not built. Assigning an owner currently records the delegation + toasts "Assigned to X" — **no message is sent yet** |
| PWA | Manifest + SVG icon done; PNG/apple-touch icons pending |
| Vercel deploy | ⬜ Not started |

## What was verified live (2026-08-25, real DB + real Haiku calls, test data cleaned up after)

1. Capture on Home → `/api/classify` inserts entry FIRST, then classifies (AI failure can never lose a thought — it lands in Board's "Needs a look").
2. Classification quality: strategy thought → `is_leverage=true`; operational thought → `false` + auto-suggested
   the VA as owner; second entry fuzzy-matched into the project the first entry created ("Pre-Foreclosure Strategy").
3. Board: flash+toast on new entry, scope chips w/ counts, pulse bar math, entry sheet prefill,
   "AI pick" badge on suggested owner, owner assign → delegations row (task text frozen as `expected_outcome`),
   done → auto "How did it go?" closeout → `actual_outcome/verdict/outcome_note/resolved_at` persisted.

## Supabase

- Project ref: `bgycaxlakcknyolbznpx` · region **us-west-2** · URL `https://bgycaxlakcknyolbznpx.supabase.co`
- Schema migration `supabase/migrations/001_init.sql` **applied by Dave via dashboard SQL editor** 2026-08-25
  (verified over REST). Tables: businesses, people, projects, entries, delegations, app_settings (single row).
  Seeded businesses: True Home Acquisitions, TC Dental Lab.
- **Migrations work**: `npm run db:migrate` (`scripts/migrate.mjs`) runs via the **Supabase Management API**
  (`SUPABASE_ACCESS_TOKEN` in .env.local, personal access token, **expires ~2027-08-25** — regenerate at
  Account > Access Tokens). `_migrations` tracking table live; 001 backfilled 2026-08-25; verified "nothing to apply".
- Postgres wire auth is BROKEN on this project and abandoned as a path: the session pooler
  (`aws-0-us-west-2.pooler.supabase.com`) recognizes the tenant but rejected **4** correct password resets
  AND a full project restart (REST fine throughout). Supabase-side fault; a support ticket is the only fix
  if wire access is ever actually needed. `DATABASE_URL` remains in `.env.local` as a documented-broken fallback.
  Direct host `db.<ref>.supabase.co` is IPv6-only → unreachable from Dave's machine. psql/supabase CLI not installed.

## Env (`.env.local`, never committed — real values live there now)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable `sb_publishable_…`)
- `SUPABASE_SERVICE_ROLE_KEY` (secret `sb_secret_…` — server only)
- `ANTHROPIC_API_KEY`
- `DATABASE_URL` (present but auth-broken, see above)
- Twilio vars stubbed/commented for the notifications pass.
- ⚠ Past mixup: the secret key was originally pasted into the NEXT_PUBLIC anon slot — double-check slots when rotating.

## Design system notes

- Tokens/type/spacing/motion: `docs/DESIGN.md` §1–§9, ported 1:1 into `app/globals.css`. Never raw hex in components.
- **§9b Build additions** (2026-08-25 polish pass, Dave-requested): paper-grain background, time-adaptive home
  glow (`data-band` on `.home-glow`), staggered entrances, checkbox pop, pulse ticks + one-time shimmer,
  nav notch/toast/grab-handle motion, empty-state doodles, capture-box amber hairline,
  and one token change: `--dim` `#9DA1A8` → `#8F949C` (contrast). All reduced-motion safe.

## Dev workflow

- Dev server: Browser-pane preview config **`levr-dev`** (D:\Claude\.claude\launch.json) → port **3005**.
- ⚠ **Gotcha:** `npm run build` while the dev server runs kills the dev server (shared `.next`). Stop dev first.
- `npm run build` must pass before calling any pass done.
- Repo: levr lives inside the D:\Claude git repo (branch `main`). First commit: `6b352ea` (2026-08-25;
  `.env.local` excluded, staged diff secret-scanned before committing).
- GitHub: `https://github.com/mqd882003-ai/Levr` holds ONLY the levr/ subtree (split history, pushed
  2026-08-25 after a full-history secret scan) — NOT the whole D:\Claude workspace. To publish new commits:
  `git subtree push --prefix=levr origin main` (run from D:\Claude; `origin` there points at Levr.git).

## Phase 2 specifics (2026-08-25)

- Tier 2 = `claude-sonnet-5` + consultant persona (lib/tier2.ts), fired via `after()` from /api/classify —
  off the capture path, lands ~5-15s later. Applies revisions in place; if the user already acted
  (done/assigned/corrected), it flags (`entries.tier2_status='flagged'` + reason chip "Reclassify?")
  instead of overwriting. Any user classification edit clears the flag.
- Checklists: `checklist_items` table (chosen over JSON column); generated only for delegated items and
  only when none exist; editable in the entry sheet; "n/m steps" on the row.
- Corrections: `corrections` table logs user changes to business/project/is_leverage/owner (entry-scoped)
  and capability_notes (person-scoped). Last 20 feed Tier 2 + Review prompts. Purely user-initiated edits —
  applying a Review suggestion is deliberately NOT logged.
- Review with me: dashed pill under the pulse card (only when entries are open); respects current scope
  chip; POST /api/review; one optional round of ≤3 clarifying questions; per-suggestion apply/dismiss via
  applyReviewSuggestion. Suggestion fields limited to is_leverage/business/project (owner changes stay in
  the entry sheet where assignment side-effects live).
- Gotcha learned: Sonnet 5 adaptive thinking spends from max_tokens — small caps truncate JSON mid-string
  ("Unterminated string"). Budgets: tier2 8000, review 10000, with stop_reason==='max_tokens' guards.

## Key implementation decisions (why things are the way they are)

- Entry is inserted before classification; classify failure returns the unclassified entry (`classified:false`).
- `delegations.expected_outcome` stores the task line at assignment time = "what was asked" in history.
- Changing/removing an owner **deletes** the never-resolved open delegation (no history pollution);
  resolved rows are never touched. Entry's displayed owner = latest delegation (open or resolved).
- `app_settings` is a single-row table (id boolean PK) — spec had no home for name/notif toggle; flagged + accepted.
- People deletes set `delegations.person_id` NULL (history survives; profile view is gone).
- Voice: textarea + keyboard dictation is the primary path; in-app Web Speech is a bonus that self-disables
  in standalone/PWA mode (spec §Voice input).

## Next actions (in order)

1. **Notifications pass**: `/api/notify` — one message per explicit assignment via person's preferred channel
   (Twilio SMS needs its own A2P campaign — separate from the True Home lead-gen campaign; email; optional Slack).
4. Vercel deploy + PNG/apple-touch icons.
