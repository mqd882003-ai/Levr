# Levr — Project State

> Backup of build state and session knowledge. Update at the end of each working session.
> Last updated: **2026-08-31** (same session, continued into Web Push) — **Web Push
> SHIPPED: built (all 3 phases), committed `34a886b`/`dfa81de` → GitHub `59ed6f8`/
> `18f103f`, deployed, and live-verified end to end** — a real subscription row landed
> (`push_subscriptions`, `fcm.googleapis.com` endpoint), a manual test push sent through
> `lib/push.ts` directly (not the cron) returned `{"sent":1,"failed":0}`, and **Dave
> confirmed on his phone it actually arrived** — not just a 200 from the push service,
> the real thing.
> **⚠️ Vercel plan ceiling — READ BEFORE touching any cron/scheduling work**: Levr is on
> **Hobby**, confirmed directly with Dave (not assumed). Hobby enforces a once-per-day
> cron floor — any more-frequent schedule fails at deploy time (this is the SAME failure
> mode as the 2026-08-27 incident below, hit a second time before catching it here).
> Checked current Vercel docs for a workaround (an external scheduler hitting the
> existing CRON_SECRET-gated route on any cadence, bypassing Vercel's own cron entirely)
> — Dave's explicit call: **stay on Hobby, no external scheduler, no workaround.**
> **Need to upgrade to Pro for sub-daily/precise cron timing — currently capped at
> once-daily on Hobby.** (Couldn't put this note IN `vercel.json` itself — checked
> Vercel's own published schema at openapi.vercel.sh/vercel.json and it sets
> `additionalProperties: false` at the top level, so any comment-style key would risk
> failing schema validation at deploy time. Noted in the `app/api/notify/flush/route.ts`
> header comment instead, plus here.) `vercel.json`'s cron is `30 13 * * *` — 6:30am
> Pacific during PDT, drifts to 5:30am during PST (Nov–Mar; Vercel cron is UTC-only, no
> DST awareness — same one-hour seasonal drift the original `0 16 * * *` already had,
> documented the same way). Vercel also only guarantees firing sometime within that UTC
> hour, not the exact minute.
> **What got rebuilt because of this**: the original Web Push Phase 1 spec wanted a
> precise 15-min-before-deadline push — impossible on a once-daily cron, so
> `lib/deadlineReminders.ts`'s `sendDailyDeadlineDigest()` reworked it into "what's due
> today" (Pacific calendar day, ±1 day lookback so an entry captured same-day AFTER the
> morning run — which would otherwise never get announced — is still caught by the next
> day's run), bundled into ONE push (up to 5 items named, "+N more" beyond that), not a
> push per entry. **Phase 2 (`lib/decayReminders.ts`, `sendDecayDigest()`)**: mirrors
> `EntryRow.tsx`'s client-side `stale` chip exactly (same 6-day threshold, same
> unsorted/unowned definition — an entry that ever had ANY delegation, even a resolved
> one, counts as owned forever, matching `boardEntries.ts`'s `ownerId`; same parked
> exclusion) so the push and the on-screen "Needs a decision" tag can never disagree.
> New `entries.decay_notified_at` (migration 014) — set once, ever, never re-notified even
> if the item somehow decays again later, per spec ("once, not repeated every day it
> stays decayed"). **Phase 3**: `lib/notify.ts`'s `flushHeldNotifications()` now pushes
> Dave "Sent while you were away — [task] → [person]" right after a held SMS actually
> sends — awaited, not fire-and-forget (the whole cron route awaits everything before
> responding; an un-awaited push here could get cut off if the function froze right
> after), wrapped in its own try/catch so a failed confirmation push can never affect the
> already-recorded real send. All three jobs run via one `Promise.all` in
> `/api/notify/flush`, same route, same single daily cron — no second scheduler.
> **Infra built fresh, not extended — the "existing PWA setup" the original ask assumed
> didn't actually exist**: no service worker of any kind was present (`app/manifest.ts` is
> just install metadata). Built `public/sw.js` from scratch (`push` + `notificationclick`
> listeners) and `lib/pushClient.ts` (lazy SW registration — only on first subscribe, no
> auto-prompt on load, per spec). `push_subscriptions` table (013) + `entries.
> deadline_reminder_sent_at` (013). Settings toggle wired for real in the You block
> (`components/settings/SettingsClient.tsx`) — deliberately NOT reusing the pre-existing
> disabled "Push notifications — Soon" row under Communication channels, since that one
> describes a different, unbuilt concept (pushing to a *team member's* installed app);
> renamed it "Push to team" to disambiguate the two rows.
> **VAPID keys, the actual saga**: Dave said they were already in `.env.local` + Vercel;
> neither was true. First reconstructed a split from Dave's garbled paste (byte-length
> math landed exactly — 87/43 chars — and `web-push`'s own `setVapidDetails()` accepted
> the format), but that only ever proved format, never that Vercel actually had ANY of
> the three vars. First live test failed with "missing VAPID public key" — confirmed root
> cause by grepping the actual deployed client bundle: the public key string was absent
> entirely (0 matches), proving Vercel's env never had it, not a bad key. Dave then found
> a third-party "VAPID key generator" website and generated a new pair there — caught
> before using it that its `subject` field was malformed (`"mailto: <email>"` — space +
> angle brackets, not valid JWT `sub` syntax) and that trusting a random site with a
> private key is an unnecessary risk when the project already has `web-push` installed.
> Generated a clean authoritative pair via `webpush.generateVAPIDKeys()` directly instead,
> validated the same way, saved to `.env.local`. Dave added all three to the Vercel
> dashboard and redeployed — confirmed via REST + a real send that this pair works.
> (Note for later: the subscription's endpoint is `fcm.googleapis.com`, i.e. Chrome's push
> service, not Apple's `web.push.apple.com` — worth a closer look if push ever behaves
> differently specifically through Safari/the iOS home-screen install vs. a Chrome tab.)
> **Found `Levr.txt` in the repo root** (Dave's own scratch notes) with a live Supabase
> access token and DB password in plain text, untracked but NOT gitignored — added
> `/Levr.txt` to `.gitignore` this session so it can't accidentally get swept into a
> commit. The file itself was left untouched (not Claude's to delete/move).
> **Verified before shipping**: `tsc`/lint/`next build` clean (zero new lint errors — the
> pre-existing React-Compiler errors elsewhere in the project are unchanged); live
> browser-automation click-through on the Settings toggle confirmed the subscribe flow
> runs correctly end-to-end up through requesting OS permission (denied automatically by
> the sandboxed test browser, as expected — no human there to click Allow — and the code
> handled that denial gracefully: toast shown, toggle stayed off, no crash); the Pacific
> 8am timezone math (from the original precision design, now superseded by the digest
> model but the same round-trip technique is reused for calendar-day comparisons) was
> unit-verified correct across both the PDT and PST offsets.
> **Nothing queued next** for Web Push unless Dave asks for something new — all 3 phases
> shipped and confirmed live. Standing reminder: the once-daily digest model (not
> per-minute precision) is a Hobby-plan ceiling, not a design choice — revisit the timing
> model if/when the project moves to Pro.
>
> Previous update 2026-08-30 (same day, session continued past Calendar Phase 2) — **two
> bugs found, fixed, live-verified, and pushed.** **Bug 1 — Board rows stuck on "Still
> sorting…" forever** (two TC Dental Lab rows: "Reviewing Hiro production sheet" and "Redo
> Dr. Cary treatment plan…"), swipe-delete panel also left exposed at rest on the same two
> rows. Traced root cause via REST before touching anything: both rows had genuinely
> completed Tier 1 **and** Tier 2 classification (`tier2_at` stamped, matching sibling rows
> showing `tier2_status: "revised"`) — the `corrections` table showed the founder had
> manually corrected `is_leverage` on each *after* Tier 2 finished. `saveEntry` and
> `applyReviewSuggestion` (`app/board/actions.ts`) reset `tier2_status` to **null** on a
> user edit (meant to clear a stale disagreement flag) but never re-run Tier 2 — so the row
> reads as permanently "still processing" to `EntryRow`'s `tier2Status === null` check, since
> nothing ever writes a resolved value back. Fixed: those three write sites now stamp
> `"confirmed"` instead of `null` (the founder's own correction is authoritative, no further
> Tier 2 opinion needed); matched in `BoardClient`'s optimistic patch for the same flow.
> Verified `EntryRow`'s processing check and `BoardClient`'s `hasPending` poll both already
> treat any non-null value as resolved — no changes needed there. Swipe-panel bug was
> unrelated (not tier2-linked): `SwipeRow`'s `revealed` state only ever reset on tapping the
> *same* row again — nothing closed it when interaction moved elsewhere. Fixed with a
> `pointerdown` listener (capture phase, active only while revealed) that closes the row on
> any interaction outside its own `.row-wrap`. Backfilled the two real stuck rows to
> `tier2_status: "confirmed"` via REST, verified before/after. Committed `340ea30`.
> **Bug 2 — Tier 1 over-split a single capture into overlapping/duplicate chunks**: a real
> TC Dental Lab capture produced two board rows both covering the same bone-scan/Dr.
> Bodyfelt/Joe concern (one chunk was literally a duplicated substring of another's tail).
> Tightened the Haiku splitting prompt in `lib/classify.ts` (a shared subject worded two
> ways is elaboration, not a new concern; summaries must describe only what's unique to
> that chunk) — confirmed via 6 live repro runs that this **reduces but doesn't eliminate**
> the over-split (still happened ~1 in 3 runs), so added a code-side safety net,
> `detectChunkOverlaps`: flags a chunk when it shares a `mentioned_people` name or ≥50% of
> its summary's significant terms (generic task verbs filtered out) with an earlier chunk
> from the same capture. Reuses the existing `tier2_status: "flagged"` + reason-chip
> pattern rather than a new mechanism; flagged chunks are excluded from the async Tier 2
> pass in `app/api/classify/route.ts` (Tier 2 unconditionally overwrites `tier2_status` on
> completion, which would erase the flag within seconds). Confirmed genuinely-separate
> multi-chunk captures (different businesses; same business, different people) stayed
> clean and unflagged across repeated live runs — no suppression of legitimate splits.
> Committed `f068970`. **Both commits pushed** via `git subtree push --prefix=levr origin
> main` (GitHub tip `5358d50`/`68b9003`) — verified past the push exit code: commit
> subjects/order match, and `git diff HEAD:levr origin/main` came back empty (byte-identical
> trees). **Live-verified, not just pushed**: the swipe-panel fix's exact minified closure
> (`pointerdown` capture-phase listener + `.row-wrap` containment check) found intact in the
> deployed `/board` JS bundle. The overlap guard is server-only (API route + server action,
> never shipped to the client, so a bundle grep structurally can't prove it) — verified
> instead with a real POST to production `/api/classify` reproducing the exact split, and
> confirmed via REST that both duplicate chunks landed `tier2_status: "flagged"` with the
> expected reason text. Test entries (4) and their checklist items (3) deleted after —
> the pre-existing "Case Review" project one of them fuzzy-matched into was **not** touched,
> since a real prior entry also references it (checked before deleting anything).
> `tsc`/lint/`next build` clean on both fixes; the 6 pre-existing React-Compiler lint errors
> (unrelated code, confirmed pre-existing via `git stash` diff) are unchanged.
>
> Previous update 2026-08-30 (same day, session continued to completion) — **Calendar
> Phase 2 item 5 — hour-grid Calendar view — shipped. This was the last of the four
> calendar views; Day/Week/Month/Calendar are all now live and reviewed.** **Pre-item
> sanity check** (this item's core job is the collision flag, and item 3's sanity check
> had already flagged the exact risk): does the collision check correctly catch an
> early-morning deadline as colliding with Sleep's overnight 22:00–05:30 window, given
> Sleep has no explicit continuation block into the next calendar day? Found the correct
> precedent already in production code — `notify.ts`'s `isWindowActive` handles this
> exact case for its own purpose (notification holds) via an overnight-wrap branch
> (`minutesNow >= startMins || minutesNow < endMins` when `startMins > endMins`). Wrote
> `collidesWithSilentWindow` in `CalendarClient.tsx` as an independent, decoupled
> implementation of that same minute-math — not an import from `notify.ts`, per both
> calendar handoffs' explicit rule to keep the visual collision flag and the live
> notification-hold system separate. **Live-verified the fix actually matters**: seeded a
> 3am test deadline and confirmed `hasFlag: true` via DOM inspection — without the
> overnight-wrap branch this would have been a real, silent miss (a naive same-day range
> check treats Sleep as 22:00–05:30 literally and 3am falls outside that literal range).
> This was net-new code, not an existing bug — nothing wired the collision flag before
> this item. **Hour-grid view**: 6am–10pm axis, horizontal-scrollable 7-day week (reuses
> the same `days` array Week already computes — no separate fetch), deadline pills
> positioned by actual clock time and clamped (not hidden) if outside the visible axis
> range so nothing silently disappears, protected-window bands at their real position,
> untimed windows AND all-day deadlines both render as chips in an untimed stack (same
> "don't fabricate a time slot" rule extended symmetrically to all-day deadlines, which
> the spec didn't explicitly cover but the principle clearly does), a "now" line on
> today's column (hidden outside the visible hour range rather than clamped, since a
> clamped now-line would misrepresent the actual time), tap-to-`EntrySheet` on every
> pill. Navigation reuses Week's `weekOffset` semantics exactly (a 7-day window, not a
> single day/month) — the existing `navigate()`/Today-jump logic needed zero new branches,
> falling through to the week case for free. New `--now` design token (`#2e6fcf`) added
> to `:root` per the "never raw hex in components" rule. Committed `24d3b9d` → GitHub
> `bcf76c1`, confirmed live against seeded fixtures (3am/noon/6:30pm/all-day cases) then
> committed/pushed, then confirmed a second time directly on production
> (levr-six.vercel.app): toggled to Calendar, saw the real Aug 31 all-day entry as a
> chip, tapped it, the real `EntrySheet` opened with its real content. `tsc`, lint (same
> 16 pre-existing errors, none new), `next build` clean. **The full Day/Week/Month/
> Calendar toggle is complete** — Phase 2 of the calendar work (manual add, all four
> views) is done; nothing queued next unless Dave asks for something new.
>
> Previous update 2026-08-30 (same day, continued further) — **Day view
> (item 3) reviewed and approved by Dave.** Its pre-item sanity check this round: does the
> chronological merge break when an early-morning deadline overlaps Sleep's real
> 22:00–05:30 overnight schedule? Traced through the actual code (`expandWindow`,
> `dayWindowsFor`) — confirmed NOT a bug in the new sort. The protected-window model
> already represents Sleep as exactly one instance per calendar day, keyed to its 22:00
> start time (this is pre-existing, shared unchanged with Week view, not something Day's
> merge introduced). A 4am deadline sorts near the top of that day's list (240 min) and
> Sleep's card sorts near the bottom (1320 min, since it's labeled by its 10pm start) —
> internally consistent minute-of-day ordering. The real gap is that the model has no
> separate block for "still asleep until 5:30am from last night" — that's a modeling
> limitation belonging to the collision-flag feature (item 5, hour-grid Calendar, which
> explicitly owns silent-window collision detection per the handoff), not something to
> retrofit into Day's plain chronological sort. No fix made — confirmed correct as-is.
> **Phase 2 item 4 — Month view** shipped: 6×7 grid, today outlined, dot-per-deadline
> capped at 3 + a "more" indicator dot past that (verified via a seeded 4-deadline day —
> renders 3 regular dots + 1 `.dot.more`, not 4 plain dots). Tapping an in-month date jumps
> into Day view for that date; other-month padding cells are dimmed and inert (`disabled`,
> per spec — Month is navigation-only, never opens `EntrySheet` directly). Prev/next
> arrows and the Today-jump chip extended to a 3-way `navigate(dir)` switch (day / month /
> week), each view's arrow meaning genuinely different amounts of time, not one shared
> interpretation. Dot counts are read from the same `dated` array Week/Day already
> compute (`deadlineCountByDate`, a `useMemo` over it) — no separate query, one source of
> truth across all three views. New `.month-*` CSS family. Committed `c5a2588` → GitHub
> `3bcb904`, confirmed three ways this time (the strongest verification yet): bundle-
> grepped (`` className:`month-cell${a?"":" other-month"}...` ``, `"Next month"`) **and**
> a full click-through directly on production (levr-six.vercel.app) — toggled to Month,
> confirmed the real Aug 31 entry's dot, tapped it, landed correctly in Day view showing
> that same entry. **View-count question resolved earlier this session** (Dave: all four
> views ship) — no longer a blocker. Calendar (hour-grid, item 5) is next, not started —
> stop-for-review after this one too, per the usual rule.
>
> Previous update 2026-08-30 (same day, continued) — **View-count question resolved:
> Dave decided all four calendar views ship** (Week done, Day/Month/Calendar to follow).
> **Phase 2 item 3 — Day view** shipped: vertical agenda, windows+deadlines merged and
> sorted chronologically together (a deliberate choice, documented in `CalendarClient`'s
> header comment — differs from Week's still-unsorted deadlines-before-windows listing,
> left as-is since only Day was asked for). Functional Day/Week toggle (Day was
> previously a disabled stub); prev/next arrows and the Today-jump chip made view-aware;
> tapping a deadline card opens the real `EntrySheet`. New `.day-card` family in
> `globals.css`. Committed `303b80a` → GitHub `d90758b`, confirmed live two ways:
> bundle-grepped (`` className:`day-card protected...` ``, `"Previous day"`) AND
> visually confirmed working on production itself. **Pre-item sanity check**:
> manually-created entries' synthesized `explicit_deadline` label can never actually
> render anywhere — both surfaces that show that field in quotes (undated strip,
> `DateAssignSheet`'s "Originally said") are gated on `!deadlineAt`, and manual creates
> always carry a real `deadlineAt`. No fix needed; confirmed by grepping every read site,
> not just reasoning about it.
>
> Previous update 2026-08-30 (same day, earlier) — Calendar interaction layer, three
> items shipped in sequence, each committed + subtree-pushed + GitHub-API-verified +
> live-bundle-grepped before moving to the next: **Phase 1 item 1** tap-to-edit via the
> real `EntrySheet` (reschedule date/time fields, "Mark done" → the existing closeout
> flow) — `118367b` → GitHub `016914a`. **Phase 2 item 1** undated-strip date assignment
> via new `DateAssignSheet` — `0b6d73a` → GitHub `b3dd70e`. **Phase 2 item 2** the manual
> "+" add button via new `CreateEntrySheet` + new `createManualEntry` server action
> (bare insert — Board's quick-add turned out to call `/api/classify`, not a bare insert
> as the handoff guessed, so there was nothing existing to reuse; `saveEntry` is
> update-only) — `e1f70fc` → GitHub `d5b21e2`. Full detail in the Build status table below.
>
> Previous update 2026-08-30 (earlier same-day session) — Intent Router shipped
> end-to-end (Gate 1/2, all 5 intents, universal processing state, orbit animation) AND
> the capture button copy change ("Sort it" → "Levr, go") both committed and live this
> session. Standing rule still applies: neither counted "done" until subtree-pushed +
> tree-verified + bundle-grepped against the live deploy — both were.
>
> Previous update 2026-08-28 — routing junction stages 1–5 COMPLETE, committed AND (after a
> caught deploy gap — see Dev workflow) subtree-pushed + bundle-verified live. iOS long-press
> text-selection fix shipped (`7ae2bf7`). Decisive-gate + reroute-on-reclassification fixes
> shipped (`539efa9`) with a one-row backfill (the stale VA pick → Danny). Standing rule from
> this session: **no stage is "done" until subtree-pushed and verified against the served
> bundle** — a local commit alone is not shipped.
>
> Previous update 2026-08-27: everything through the cron fix (`4cf70ba`) pushed and
> deploy-verified green (the Hobby-plan sub-daily cron was silently failing every deploy — fixed).
> DB wiped to a clean slate at Dave's direction (Team kept: Danny/Yana/Andrie). Calendar week
> view (5th nav item) built, migration 010 applied, live-tested, committed.
> **Command box SHELVED by Dave's explicit reversal** — gestures replace it.

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
- Deployed on Vercel via the GitHub repo (auto-deploys each subtree push); functions pinned to pdx1 (vercel.json)

## Build status by screen

| Screen | Status |
|---|---|
| Home (greeting + capture + classify) | ✅ Built, live-tested end-to-end |
| Board (sections, pulse, chips, sheets, closeout) | ✅ Built, live-tested end-to-end |
| Team (cards, profile+history, add/edit) | ✅ Built, live-tested end-to-end |
| Settings (name, businesses, toggles, channels, data) | ✅ Built, live-tested end-to-end |
| Phase 2: Tier 2 pipeline + checklists + corrections + Review with me | ✅ Built (migration 002), live-tested end-to-end |
| Delegation notifications (SMS via Twilio) | ✅ LIVE — carrier-confirmed delivery to Danny 2026-08-25, sends from **+15033038668** |
| Swipe gestures on Board rows (right=Done, left=Delete w/ confirm tap, no checkbox) | ✅ Built, device-verified by Dave |
| Perf: loading skeletons + router staleTimes(30s) + Vercel region pin pdx1 | ✅ Built (verified locally; region pin verified live on levr-six) |
| Delegation Evolution addendum A1–A6 (migration 003) | ✅ Built, live-tested end-to-end (see specifics below) |
| PWA icons (192/512 any, 512 maskable, 180 apple-touch PNGs) | ✅ Generated + wired into manifest/layout |
| Vercel deploy | ✅ Live at **https://levr-six.vercel.app** — health-checked (all routes 200, pdx1 pin active, env fixed after ANTHROPIC_API_KEY was found empty), classification + Tier 2 verified running in production, /api/env-check deleted |
| Personal Config Import — schema + seed (migrations 004/005) | ✅ Applied + REST-verified. `personal_settings` (protected windows, override_rule, notification_rule, quiet hours) seeded with Dave's real data; `business_settings` seeded for all 4 businesses (True Home Acquisitions, TC Dental Lab, 3D Scan, Backtesting — latter two newly created as `personal_project`); `delegations.stage` column added, unused so far. Committed `6958c12` (schema/seed/types only — PROJECT_STATE excluded from that commit), pushed via `git subtree push --prefix=levr origin main` → GitHub `main` confirmed at `42bd0ec` (verified via GitHub API, not just push exit code). **Vercel auto-deploy status: unconfirmed** — `levr-six.vercel.app` isn't a project under the Vercel scope this machine's CLI is authenticated to (`true-home-acquisitions`); no API access to check the build fired. Low-risk either way — this push is Supabase migration SQL (already applied directly, not via Vercel) + additive `lib/types.ts` types nothing yet imports, so a stale deploy has no functional impact. HANDOFF task 3 (classifier + notify.ts) is now built — see next row. Board UI (task 5) and Onboarding UX (task 6) remain not started. |
| HANDOFF task 3 — protected-window notification hold | ✅ Built, migrated, committed `4873aea`, pushed and confirmed at GitHub `dd73972`. `lib/tier2.ts`: `assessProtectedWindowUrgency()` — Sonnet (not Haiku) judges whether a pending assignment message is urgent enough to interrupt a protected window, against `personal_settings.override_rule`. `lib/notify.ts`: `notifyAssignment()` checks for an active silent protected window before sending; any Tier 2 failure defaults to holding (never silently sends); outcomes persist to `delegations.notify_status`/`notify_note` (migration 006). New `flushHeldNotifications()` + `/api/notify/flush` (CRON_SECRET-gated) + Vercel Cron entry (every 30 min, `vercel.json`) deliver held messages once the window closes naturally — does not re-ask Tier 2, and re-checks the global notifications toggle at flush time. **Caught and fixed pre-ship**: windows with no explicit clock time were defaulting to "active all day" (would have held nearly every send) — fixed so only day-scoped windows with no clock time (Church) count as all-day. Migration 007 gave Dinner an explicit 18:00–19:30 range (Dave confirmed, approximate) so it now gates holds like Sleep/Gym/Church. Timezone assumed `America/Los_Angeles` (Vercel region pin), confirmed by Dave. `tsc`, lint, and full `next build` all pass clean. **RESOLVED 2026-08-27**: the cron frequency WAS the problem — Hobby plan rejects sub-daily crons, which silently failed every deploy; schedule now `0 16 * * *` (daily ~9am Pacific, commit `4cf70ba`), deploys confirmed green since. Held notifications now flush once daily, not every 30 min — revisit on Pro. `CRON_SECRET` still Dave-confirmed only. HANDOFF task 4 (below) covers Board UI's personal_project + stage rendering, but `notify_status` still isn't surfaced anywhere in the UI. |
| HANDOFF task 4 — Board UI (personal_project hide, delegation stage) | ✅ Built, committed `f0f3064`, pushed and confirmed at GitHub `fda4aa8`. `app/board/page.tsx` now fetches `business_settings.project_type` and threads a `businessId -> project_type` map through `BoardClient` → `EntrySheet`. `EntrySheet`: for an entry whose *currently selected* business is `personal_project` (3D Scan, Backtesting), the Your 20%/Delegate toggle is hidden entirely (is_leverage forced true via a derived `effectiveLev`, per HANDOFF decision #2), along with the Hand-off-to and Steps sections — reactive if the business is changed mid-edit, not just the entry's original business. `HistoryTimeline.tsx`: delegation cards render `delegations.stage` progression (assigned/contacted/appointment_set/closed/lost) in place of the binary done/not-done badge when a delegation has a stage set; falls back to the old binary display otherwise. Reuses the existing verdict-badge CSS classes, no new styles. **Render-only — nothing writes `stage` yet**, so this won't visibly change anything until a stage-setting UI exists (not built, not asked for this pass). `tsc`, lint, and full `next build` all pass clean, no new issues (confirmed same 16 pre-existing lint errors, all in files this change didn't touch). **Live click-through: personal_project hide ✅ confirmed by Dave, 2026-08-26** — works as expected on device. **Delegation stage progression: still unverified** — nothing writes `stage` yet, so there's no real delegation to test the rendering against (static checks only: `tsc`'s exhaustive `Record<DelegationStage,...>` check, a manual trace of every `lev`→`effectiveLev` call site). Onboarding UX (task 6) remains not started, still blocked on this task per the handoff. |
| Multi-business capture split + mentioned-people hint | ⚠️ **Splitting logic superseded 2026-08-26 — see next row.** Tier 2's splitting (`additional_segments`) has been removed; Tier 1 chunking replaces it. The mentioned-people mechanism described below is still live, now merging with Tier 1's stricter per-chunk version instead of being the only writer. ✅ Built, migrated, committed `31e3635`, pushed and confirmed at GitHub `54f9cf4`. Not a HANDOFF task — requested after Dave stress-tested task 4 with a real multi-topic capture and hit two gaps. **Split**: `lib/tier2.ts`'s existing async Tier 2 pass now also detects when a capture genuinely narrates separate concerns for more than one business and creates the extra entries (`entries.split_from_entry_id` traces back to the original), narrowing the original entry's summary to just its own business. Tier 1/Haiku unchanged — still files immediately under one best-guess business, nothing ever lost or delayed. Biased toward not splitting single-topic captures. **Mentioned people**: Tier 2 also returns names mentioned in the text not already in Team (filtered against the roster), persisted to new `entries.mentioned_people`; `EntrySheet` shows a dismissible hint per name with one-tap "Add to Team" (`addMentionedPerson`/`dismissMentionedPerson` in `app/board/actions.ts`) — never an auto-create, per requirements §Team's manual-entry-only rule for people. Migration 008. **Verified live against Dave's actual test capture, not synthetic data**: ran the real Tier 2/Sonnet pass on his stress-test entry via a throwaway `tsx` script (deleted after) and confirmed via REST — it correctly split out a new True Home Acquisitions entry (the VA-meeting portion) while narrowing the original TC Dental Lab entry's summary, and correctly suggested Evan/Aaron/Marisa while excluding a fuzzy-matched existing team member (Andre → Andrie) and a non-team case reference (Dr. Basilli). `tsc`, lint, and full `next build` all pass clean, no new issues. **Not yet click-tested in the UI** — the "Add to Team"/dismiss hint buttons in `EntrySheet` haven't been exercised live, only the underlying data pipeline. |
| Tier 1 multi-chunk classification | ✅ Built, migrated, committed `19f21c6`, pushed and confirmed at GitHub `f5a2102`. Replaces the (now-removed) Tier 2 splitting from the row above. `lib/classify.ts`: `classifyEntry` → `classifyCapture`, returns `Chunk[]` — Haiku splits a capture into logical chunks only when topics are genuinely different (business/task/purpose), never just for length; most captures stay one chunk. Per chunk: business, project, `is_leverage` (forced `true` in code — not just prompt wording — when the business's `project_type` is `personal_project`; `businessProjectType` now joined into the prompt), summary, `suggested_owner_id`/`category` (unchanged logic, just per-chunk), `mentioned_people` (strict, explicit-only, filtered against the current Team roster), `explicit_deadline`/`stated_reason` (literal text or null, never inferred — new columns, migration 009). `app/api/classify/route.ts`: still inserts one entry first as the safety net; chunk 0 updates it in place as the anchor (`split_from_entry_id` null), chunks 1+ insert as siblings pointing at the anchor; Tier 2 now runs per chunk via `Promise.all` instead of once per capture. `lib/tier2.ts`: its own splitting logic (`additional_segments`/`Tier2Segment`/`parseSegment`/the insert loop) removed — confirmed cleanly isolated before removal (no entanglement with the is_leverage/business revision pass); `mentioned_people` now merges (union) Tier 2's looser suggestions into whatever Tier 1 already wrote, instead of overwriting. `tsc`, lint (same 16 pre-existing errors, none new), full `next build` all pass clean. Migration 009 applied + REST-verified (`explicit_deadline`/`stated_reason` confirmed present, null on existing rows). **Not yet tested end-to-end against a live capture** — no real multi-topic voice/text capture has been run through the new chunking path yet, only static checks. |
| Tier 1 segmentation fix + `business_evidence` guard | ✅ Built, verified against the real API across multiple runs, not yet pushed. **Segmentation**: the first real test (a messy 8-concern capture) produced 1 entry instead of many — free-text JSON parsing plus a soft "don't split unless obviously separate" prompt bias was suppressing splits, with no raw-response logging to debug it from. Fixed via `classify_capture` forced through `tools`/`tool_choice` (no more `JSON.parse`-and-hope), a two-step schema where the model lists `concerns` before filling `chunks`, neutral "1 to a dozen" framing, and raw-response logging (`[classify] raw_response=…` — TEMPORARY, logs capture text, deliberately left in pending a decision to strip/gate it). `MAX_CHUNKS` raised 5→25 after live captures hit 11 and then 17 real concerns that got silently truncated at 8 and then 15; a `TRUNCATED` warning now logs the exact count and the full list of dropped concern labels if the cap is ever hit again. **business_evidence guard**: testing also found chunks guessing a business from nearby unrelated context in dense captures (e.g. real-estate postcard/cold-lead tasks tagged TC Dental Lab). Added a `business_evidence` field to the schema/prompt (a literal quote from the chunk's own text, or a team member named in the chunk) plus a `parseChunk` guard that only trusts `business` when the evidence is a real case-insensitive substring of the chunk's own text or an exact team-member-name match — closes a gap where an earlier presence-only version of the guard let fabricated justification sentences through unchecked. Verified over repeated runs of a 17-concern dense capture: previously-wrong chunks now come back null (model-side or guard-forced); previously-correct ones (Yana/zirconia, "tc dental" referral, Danny, second-dental-lab-location) still pass. `tsc --noEmit` clean throughout. **Committed `f82d39c`, pushed → GitHub `e8aaf29`.** |
| Part 2 — immediate clarifying questions after capture | ✅ Built, live-tested through the real UI (three rounds incl. cap + fall-through tests), committed on top of the segmentation fixes. **A deliberate, Dave-approved exception to the "silently commit, never block" rule — documented in `docs/levr-requirements.md` §Interaction model (blockquote under rule 3); do NOT "fix" it back.** After a Home capture classifies, up to **3** tap-to-answer questions appear before navigating to Board: unresolved business → business chips + Skip; new mentioned name → "Add to Team?" / "Not now". Priority: people first, then business, oldest chunk first; 0 askable → straight to Board unchanged; 4th+ item and all skips keep their unresolved state and surface via the existing needs-a-look/Review-with-me path (verified live with a 7-askable capture: cap held, nothing silently dropped). Entries are already saved before any question renders — never-lose-a-thought untouched. Pieces: `/api/classify` returns additive `createdEntries` (id/summary/business_id/mentioned_people; quick-add ignores it); slim `setEntryBusiness` action in `app/board/actions.ts` (no correction log — null→value is a fill-in; Tier 2's changed-under-us guard already covers the race); `components/capture/CaptureQuestions.tsx` (new); queue-build + pre-`router.push` interception in `CaptureBox.tsx` (Board quick-add path untouched); Home passes the business roster; `.capture-q` styles on existing tokens/`.chip`. Answering Add reuses `addMentionedPerson` (person filed under the mentioning chunk's business, null-safe). **mentioned_people tightening (same session)**: first clean-capture regression test surfaced "the smith property lead" → a "add Smith to Team?" question — the prompt had no carve-out for names the task is ABOUT. Wording now excludes leads/customers/vendors/tenants/external parties, with the Smith example inline. Verified: Smith → `[]` + zero questions (MutationObserver-proof); "my new assistant jordan" still caught (no overcorrection); 8-concern capture regression-free (Chi/Stella surface, Danny/Yana filtered — the code-side roster filter in `parseChunk` absorbed a model wobble that listed them anyway). All test data from both rounds deleted (dry-run-then-verify), original early-session segmentation entries left per Dave. |
| Calendar (5th nav item) — week view v1 | ✅ Built, migration 010 APPLIED via db:migrate, live-tested 2026-08-27 ("remind me to call the bank by friday" captured through the real UI → landed Friday Aug 28 as All-day; undated strip correctly held the two pre-migration entries with raw quotes; 5-item nav live). Committed same session. **Cosmetic items Dave hasn't ruled on yet**: Sleep renders as the first block on all 7 days (faithful, noisy — hide/collapse/leave?); "10–5:30" time format lacks am/pm; Church gets the "floats" tag though only its time (not day) is uncertain. **Deliberate nav change, Dave-approved 2026-08-27: bottom nav is now Home / Board / Calendar / Team / Settings** (noted in `docs/levr-requirements.md` §Screens — don't "restore" 4 items). Reference: `reference/levr-combined-prototype.html` (its Board row redesign is ON HOLD; its command box is scoped separately, approved, not built). Pieces: migration `010_deadline_at.sql` (**written, awaiting Dave's review before applying**) adds `entries.deadline_at timestamptz` + `deadline_all_day boolean` + partial index; `lib/deadline.ts` parses the verbatim `explicit_deadline` ONCE at classify-save time via chrono-node anchored to `captured_at` in America/Los_Angeles (never render-time — relative phrases must not drift), null for vague/event-relative text; `/calendar` route + `CalendarClient` (Sunday-start week, prev/next paging client-side from one fetch, Day toggle stubbed disabled per v1 scope); **undated-deadlines strip** (required v1) shows unparseable deadlines with their raw text; protected windows expanded by `frequency` — imprecise ones ("4-5x/week" Gym, time-less Midday check-in) render as dashed *tentative/floats* blocks across weekdays, never omitted, never faked precise (Dave picked option a). Parser verified against 11 phrasings ("by 2pm" → timed next occurrence; "before friday" → all-day; "next month"/"this quarter"/event-relative → undated). `tsc`/lint/full build clean. Calendar page 500s until 010 is applied (orders by `deadline_at`). |
| Board row gestures (long-press assign + type-badge toggle) | ✅ Committed (`f90d401` local / `bc863f4` on GitHub) and deployed. Per `board-gestures-handoff.md` + `reference` mockup, Dave-confirmed in chat 2026-08-27: **(1) the command box is SHELVED by Dave's explicit reversal of his earlier approval — do not build it**; (2) this supersedes the on-hold pill/popover row redesign. Pieces: `SwipeRow` grew an optional `onLongPress` (480ms hold, `.pressed` scale feedback, drag >6px cancels the timer, a fired hold kills the in-flight drag and eats the release click, badge target excluded, contextmenu suppressed); `EntryRow` renders a tappable Your-20%/Delegate `type-badge` (hidden on done/null-leverage rows; **static for personal_project businesses** — same rule as the EntrySheet toggle); new `components/sheets/AssignSheet.tsx` in the existing Sheet system ("Hand off to"/"Reassign" title, current owner marked, AI-pick `suggest` treatment reused, someone-else input that matches an existing name before creating); `BoardClient.handleAssign` + `handleToggleType` both go through the existing `saveEntry` — delegation row, notification quiet-skips, correction logging, A1 create-on-the-fly all inherited, zero new write paths. Badge flip TO Delegate auto-opens the sheet (350ms); TO Your 20% doesn't. DoneDrawer rows: no gestures. Live-tested with disposable fixtures + Yana/Andrie only (no real sends, per Dave): assign ✓ reassign (owner marked, title switches) ✓ create-and-assign ✓ badge flip both ways incl. section move ✓ static badge inert ✓ drag-cancels-hold ✓ swipe-done ✓ swipe-delete ✓. All fixtures + Testperson + test corrections cleaned (dry-run-then-verify); Dave's 6 real entries and 7 real projects untouched. Lint: 6 pre-existing errors in touched files confirmed pre-existing at HEAD, none new. |
| **Intent Router** (Gate 1/2, 5 intents, universal processing state, orbit animation) | ✅ Built, live-tested, committed `afafa30`/`6e80f17`/`a6495e6`, migration 012 applied, subtree-pushed → GitHub `31e88f1` (code; docs backup `c242da8`), deploy byte-verified against levr-six.vercel.app. Per handoff `reference/intent-router-handoff-with-demos.html` (2026-08-28 final, all 5 gaps pre-decided — don't re-litigate). **Gate 1**: evidence-gated per the handoff's own precondition — §7 test set run twice against real Sonnet output before any production code; all 5 deterministic cases passed both runs, Stella stress-test correctly fell through to `task` (not on roster). Only trusts "special" when the quoted snippet literally appears in the text — same guard as `business_evidence`. **person_note**: confirm chip → writes below `— Levr's read —` marker in `capability_notes`, row leaves Board; ambiguous names ask via candidate buttons and teach a `person_aliases` row (candidates-only, never auto-trusted on later captures). **outcome_report**: resolves to exactly one open delegation or falls back to `task`; chip opens the existing closeout sheet, logging retires the report row too. **consult**: new Ask section on Board (pulsing "Still thinking it over…" while processing), full-screen `/ask/[id]` conversation, multi-turn, advises but never concludes/files/persists anything; auto-opens if still on Board when resolved, quiet toast otherwise. **decision**: tagged, stays visible, no destination invented. **Gap 3**: dismiss flow ("keep as task" / "clear it"). **Gap 4**: universal grayed-pulsing processing state + your-action-always-wins race rule, applied beyond just `task`. **Orbit animation**: built from the real SVG mark — dot lifts off, orbits while classify runs, lands on the revolution boundary, ships on Home for long dumps (>120 chars). Live-tested against the real pipeline: consult reply + follow-up turn, person_note marker write, outcome_report → closeout → delegation resolved, decision tag, plain-task regression, full orbit lifecycle — all test entries/person/delegation deleted, dry-run-then-verify. Tests 25/25, build clean, lint delta zero. **Not fully exercised, both logic-reviewed and gracefully degrading**: the auto-open/toast moment itself (hidden Browser pane suspends the rAF React needs to commit — the known gotcha; polling/RSC refreshes confirmed firing regardless) and the ambiguous-name candidate chip (needs two same-first-name roster people to trigger — not yet staged). |
| Capture button copy — "Sort it" → "Levr, go" | ✅ Built, committed `c6e25be`, subtree-pushed, confirmed at GitHub `932ee6c`. Per handoff (Dave-confirmed final copy 2026-08-28). `CaptureBox.tsx` label + `aria-label` updated — one shared button (Home + Board quick-add), no per-state variants (empty state hides the pill rather than relabeling). `handleSubmit`, "Sorting it out…" status, and the hint line deliberately untouched per scope. Repo-wide grep (case-sensitive + insensitive) confirmed zero remaining "Sort it" hits — also caught two mentions in `DESIGN.md` and all three reference prototypes, including the orbit mockup's transient "Filed ✓" flash reverting to the old string at runtime, not just static markup. `tsc`/lint (16 pre-existing, unchanged)/build clean. Deploy byte-verified against levr-six.vercel.app. |
| **Calendar interaction layer** — Phase 1 item 1 + Phase 2 items 1–2 (2026-08-30) | ✅ All three shipped in sequence per `levr-calendar-phase1-handoff.md` + `levr-calendar-phase2-handoff.md`, each independently committed/subtree-pushed/GitHub-API-verified/live-bundle-grepped before starting the next. **Phase 1 item 1 — tap-to-edit** (`118367b` → GitHub `016914a`): `CalendarClient` became a client component owning `EntrySheet`/`CloseoutSheet` state, mirroring `BoardClient`'s pattern — tapping a deadline block opens the real `EntrySheet` (not a parallel edit UI). Added a Date/Time reschedule pair to `EntrySheet` (shown only when the entry already has `deadlineAt` — never used to newly assign a deadline) that writes through `saveEntry`'s now-optional `deadlineAt` field. Added a "Mark done" row that closes the sheet and fires the same `toggleDone` the Board checkbox uses, so a delegated+owned item still gets the closeout prompt. Factored the entries→`BoardEntry` mapping out of `board/page.tsx` into `lib/boardEntries.ts` (`toBoardEntries`) so Calendar's page reuses it instead of duplicating the join logic. **Phase 2 item 1 — undated-strip dating** (`0b6d73a` → GitHub `b3dd70e`): new `components/sheets/DateAssignSheet.tsx` — tap an undated item → read-only "What it is"/"Originally said" + Date/Time pickers → "Set date" reuses `saveEntry` (same write path, no parallel route) → item moves itself out of the strip (derived from `deadlineAt`, no separate sync state); "Leave undated" is a true no-op, DB-verified. Extracted the date/time `<input>` conversion helpers (`toDateInput`/`toTimeInput`/`combineLocal`) out of `EntrySheet.tsx` into shared `lib/dateInput.ts`. **Phase 2 item 2 — manual "+" add** (`e1f70fc` → GitHub `d5b21e2`): FAB (reused Board's existing `.fab` pattern) opens new `components/sheets/CreateEntrySheet.tsx` (Summary, Business, Type toggle, Date/Time, Hand-off-to-if-Delegate using the same people-picker + inline type-a-name-to-create pattern as `EntrySheet`). New `createManualEntry` action in `app/board/actions.ts` — a genuine new bare-insert path; the handoff guessed Board's quick-add already had one to reuse, but quick-add (`CaptureBox`) actually calls `/api/classify` (the AI path), and `saveEntry` is update-only (`.update().eq("id",...)`), so there was nothing bare to reuse. Reuses `toBoardEntries` to build the returned row and the existing `notifyAssignment` trigger for Delegate creates, so a manual assignment behaves identically to every other assignment path. Every manual create synthesizes a non-null `explicit_deadline` label (e.g. "Aug 30, 2026, 11:34 AM") — required because Calendar's own fetch filters `.not("explicit_deadline","is",null)`; without it a manually-created entry would silently never appear. **Verification**: each item tested against throwaway REST-inserted fixtures (reschedule, mark-done→closeout with a real delegation, undated "Set date" + "Leave undated" DB-diffed, manual create both Leverage and Delegate paths incl. reopening the created entry in the real `EntrySheet` to confirm the delegation round-tripped) — all fixtures deleted after, dry-run-then-verify. `tsc`, lint (same 16 pre-existing errors, none new), `next build` clean for all three. Each deploy's rollout was polled and its live JS chunk grepped for source-literal markers (prop names/strings unique to the new code, e.g. `aria-label:"Mark done"`, `sub:"Manual add — no AI classification"`) — not just the GitHub tip. **View-count question resolved same day**: Dave decided all four views ship — see the item 3 row below. |
| **Calendar Phase 2 item 3 — Day view** (2026-08-30, same day continued) | ✅ Built, verified live against throwaway fixtures, committed `303b80a` → GitHub `d90758b`, confirmed two ways: live JS bundle grepped (`className:\`day-card protected...\``, the `"Previous day"`/`"Next day"` aria-label ternary) AND the Day toggle clicked and visually confirmed working directly on production (levr-six.vercel.app), not just its served code. View-count question in `levr-calendar-phase2-handoff.md` resolved by Dave (all four ship) before this item started — no longer a blocker, see the row above. **Deliberate ordering decision** (the handoff flagged this as needing an explicit choice, not a default): Day's agenda merges protected windows and deadlines into one list sorted by actual clock time (`buildDayBlocks` in `CalendarClient.tsx`), unlike Week's still-unsorted deadlines-before-windows per-day list — Week was left as-is since only Day was asked for; revisit Week's ordering separately if Dave wants it to match. Untimed windows and all-day deadlines sort to the end (no real clock position), consistent with Week's existing all-day-last convention. `dayEntriesFor`/`dayWindowsFor` factored out of the inline per-day computation so Week's grid and Day's single-day view share one filter/sort implementation instead of duplicating it. Day/Week toggle pills are both real `<button>`s now (previously static `<span>`s, Day permanently `disabled`); prev/next arrows and the Today-jump chip switch behavior based on `view` (day vs week). New `.day-card`/`.day-card-time`/`.day-card-body`/`.day-card-title`/`.day-card-meta`/`.day-only-title`/`.day-only-sub`/`.day-view` classes in `globals.css` — full-width cards per spec, deliberately distinct from Week's compact `.mini-block`. `CreateEntrySheet`'s previously-unused `defaultDate` prop now gets wired to `dayCursor` when creating from Day view (was anticipated but dead code since Day didn't exist when item 2 shipped). **Pre-item sanity check** (asked for before starting, not a blocker either way): confirmed via grep that manually-created entries' synthesized `explicit_deadline` can never render as a fabricated quote anywhere — see the top summary block for detail; no fix was needed. `tsc`, lint (same 16 pre-existing errors, none new), `next build` clean. **Reviewed and approved by Dave 2026-08-30, same session** — see the item 4 row below for what followed. |
| **Calendar Phase 2 item 4 — Month view** (2026-08-30, same day continued further) | ✅ Built, verified live against seeded throwaway fixtures (a 4-deadline day to test the dot cap, a single-deadline day one week out), committed `c5a2588` → GitHub `3bcb904`, confirmed three ways — bundle-grepped (`` className:`month-cell${a?"":" other-month"}...` ``, `"Next month"`) **and** a full click-through directly on production (toggled Month, confirmed the real Aug 31 entry's dot, tapped it, landed in Day view showing that entry) — the strongest verification combo used yet, per Dave's explicit ask this round. **Pre-item sanity check** (not a blocker, asked before starting): does Day's chronological merge assume Sleep is one clean block per day, breaking against an early-morning deadline? Traced through `expandWindow`/`dayWindowsFor` directly — confirmed the per-day-one-instance window model is pre-existing (shared unchanged with Week, not introduced by Day's merge); a 4am deadline (sortKey 240) correctly sorts before Sleep's card (sortKey 1320, keyed to its 22:00 start) — internally consistent. The real gap (no separate block for "still asleep from last night") belongs to the collision-flag feature (item 5), not Day's plain sort — no fix made, confirmed correct as-is. **6×7 grid**, today outlined via `sameDay` (stays outlined even when today falls in a dimmed other-month padding cell — intentional, matches the reference mockup). **Dot cap**: up to 3 `.dot` elements plus one `.dot.more` past that — verified via DOM inspection on the seeded 4-deadline day (3 regular + 1 more, not 4 plain dots). **Navigation-only**: tapping an in-month cell sets `dayCursor` + `view("day")`; other-month cells are real `disabled` buttons, confirmed inert by click. **Single source of truth**: `deadlineCountByDate` is a `useMemo` keyed off the same `dated` array Week/Day already compute — no separate query, per Dave's explicit ask. **View-aware navigation extended to 3 views**: `navigate(dir)` now switches on `view` (day/month/week) instead of the previous 2-way day/week ternary; Today-jump chip has a third branch resetting `monthCursor` to the current month. New `.month-title`/`.month-weekdays`/`.month-grid`/`.month-cell`/`.month-legend` family in `globals.css`. `tsc`, lint (same 16 pre-existing errors, none new), `next build` clean. **Reviewed and approved by Dave 2026-08-30, same session** — see the item 5 row below, the final one. |
| **Calendar Phase 2 item 5 — hour-grid Calendar view (last of four)** (2026-08-30, same day, session completed) | ✅ Built, verified live against seeded fixtures (noon/no-collision, 3am/overnight-Sleep-collision, 6:30pm/Dinner-collision, an all-day task), committed `24d3b9d` → GitHub `bcf76c1`, confirmed both ways again — bundle grep and a full click-through directly on production (toggled Calendar, saw the real all-day entry as a chip, tapped it, real `EntrySheet` opened with real content). **Pre-item sanity check, the important one**: item 3's sanity check had already flagged that Sleep has no explicit next-day continuation block — item 5's whole job is the collision flag, so this had to actually be resolved, not just noted. Found the exact right precedent already live in `lib/notify.ts`'s `isWindowActive` (used for a different purpose, notification holds): an overnight-wrap branch — `minutesNow >= startMins || minutesNow < endMins` when `startMins > endMins` (Sleep: 1320 > 330). Implemented `collidesWithSilentWindow` in `CalendarClient.tsx` as an independent copy of that same minute-math — never imports `notify.ts`, per both handoffs' explicit rule keeping the visual flag and the live send-path systems decoupled. **Proved the fix actually matters, not just plausible**: seeded a real 3am test entry and confirmed `hasFlag: true` via DOM inspection before deleting it — a naive same-calendar-day literal-range check (22:00–05:30 as written) would have missed 3am entirely, since 3am falls numerically outside that literal range without the wrap branch. This is net-new code (grepped first — no collision logic existed anywhere in the codebase before this item), so there was nothing broken to fix; the sanity check's job was making sure the new code didn't reintroduce the gap. Reuses `ProtectedWindow.silent` directly (same field `notify.ts` reads) — no second classification. **Hour-grid**: 6am–10pm axis, horizontal-scroll, 7-day week reusing the exact same `days` array Week already computes (no separate fetch); deadline pills positioned by real clock time and **clamped, never hidden**, when outside the visible axis (a deliberate deviation from the reference mockup, which silently dropped out-of-range pills — decided that was a data-loss risk not worth taking, since Week/Day never hide anything by time); untimed windows AND all-day deadlines (extending the "don't fabricate a time slot" rule symmetrically — the spec only named windows but the same principle clearly applies) both render as chips in one untimed stack; a "now" line on today's column, hidden (not clamped) outside the visible hour range since a clamped now-line would misrepresent the actual time, unlike a deadline pill which still carries its real time in its own label regardless of where it's drawn. Navigation needed **zero new branches** — Calendar is a 7-day window exactly like Week, so the existing `navigate()`/Today-jump/arrow-label logic already falls through to the week case for any view that isn't "day" or "month". New `--now` (`#2e6fcf`) design token added to `:root` (not hardcoded — "never raw hex in components" per `DESIGN.md`). `tsc`, lint (same 16 pre-existing errors, none new), `next build` clean. **The full Day/Week/Month/Calendar toggle is now complete and reviewed** — this is the last item of the Phase 2 calendar work; nothing queued next unless Dave asks for something new. |

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
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER=+15033038668` — ACTIVE, sends delivering
- `RESEND_API_KEY` — **placeholder, email channel not live**; `EMAIL_FROM`, `SLACK_WEBHOOK_URL` stubs
- Mirror the Twilio + Supabase + Anthropic vars into Vercel env for production sends (from-number = the 503 one)
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
- ⚠ **Gotcha (2026-08-27, unexplained):** `git apply` silently no-op'd on `lib/classify.ts` once — exit 0,
  "Skipped patch" under `-v`, zero bytes changed on disk — despite the preimage blob hash matching exactly
  and the same diff applying cleanly in a fresh throwaway repo with identical file content. Root cause never
  found (ruled out: sparse-checkout, `.gitattributes`, merge/rebase state, hooks, LFS). Worked around with
  direct file edits, verified byte-identical after. If it recurs, don't trust a clean exit code — diff the
  file against a fresh isolated repo before assuming the patch applied.
- `npm run build` must pass before calling any pass done.
- Repo: levr lives inside the D:\Claude git repo (branch `main`). First commit: `6b352ea` (2026-08-25;
  `.env.local` excluded, staged diff secret-scanned before committing). Latest code commit: `69d6ff6`
  (quick-add/owner-picker/label round); docs + state commits follow each working session.
- GitHub: `https://github.com/mqd882003-ai/Levr` holds ONLY the levr/ subtree (split history, pushed
  2026-08-25 after a full-history secret scan) — NOT the whole D:\Claude workspace. To publish new commits:
  `git subtree push --prefix=levr origin main` (run from D:\Claude; `origin` there points at Levr.git).
- ⚠ **STANDING RULE (Dave, 2026-08-28)**: no stage is "done" when merely committed locally. Done =
  subtree push has run + remote tip's tree verified identical to local `main:levr` + the live
  deployment at levr-six.vercel.app proven to serve the new code (grep the served JS/CSS chunks for
  marker strings that exist only in the new commits). Born from a real incident: all 5 routing-junction
  commits sat local-only while prod served pre-stage-1 code — a plain `git push` of D:\Claude does
  NOTHING for the Levr repo, and the subtree push is easy to forget. Remote hashes NEVER match local
  ones (subtree split; empty merge-base is by design) — compare trees or commit subjects, not hashes.
- ⚠ **Vercel visibility**: levr-six lives on Dave's separate Vercel account; the CLI on this machine
  is scoped to `true-home-acquisitions` only and cannot see it. Verify deploys via the bundle-grep
  method above or Dave's dashboard — never via the CLI here.

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

## Notifications specifics (2026-08-25)

- `lib/notify.ts` → exactly one message per explicit assignment (fired inside saveEntry when a new
  delegation is created); respects the Settings notifications toggle; failed sends never block the
  assignment (toast says so). `/api/notify` = deliberate manual resend by delegationId. Channels:
  `lib/channels/{sms,email,slack}.ts` (Twilio REST / Resend / webhook), all env-secret driven.
- **Sender number**: +15033038668 (local 10DLC, delivering). The toll-free +18773204828 CANNOT send:
  Toll-Free Verification was **rejected July 2025** ("Invalid or Inaccessible Website URL") and never
  re-filed — every send from it dies with Twilio error 30032. Re-file in Twilio Console with a valid
  website URL if that number is ever wanted as sender; until approved, keep the 503 number.

## UX round from Dave's real usage (2026-08-25 night)

- **Quick-add lands in place**: CaptureBox takes an optional `onCaptured` callback; Board's quick-add
  no longer navigates after classify (the refetch + skeleton made the board "disappear for a bit").
  /api/classify now returns `business_name`/`project_name` so the client can render the new row
  without a refetch. Home still navigates with ?new= highlight.
  **✅ Fixed, verified, pushed `69d6ff6`.** Root cause confirmed: post-classify navigation plus the new
  loading skeleton was swallowing the whole screen mid-update. Classified row now drops into the top
  of the list the moment the AI responds (flash + "Filed under…" toast); URL never changes, sheet
  auto-closes. The 1–2s "Sorting it out…" while Haiku thinks is inherent and expected — the board itself
  no longer disappears during it.
- **Owner picker offers everyone**, same-business people first (was same-business only — a dead end
  for single-person businesses like Yana/TC Dental). Label renamed **"Hand off to"** (Dave's pick over
  Assign to / Who's on it / Delegate to).
  **✅ Fixed, verified, pushed `69d6ff6`.** Root cause wasn't a tap bug — the picker only ever showed
  same-business people, and Yana was TC Dental's only person, so there was no one else to pick.
  Verified same entry now offers both Yana and Danny. (Tapping a selected person's pill deselects them —
  always true, just invisible when there was only one pill to tap.)
- Team roster now: Danny (THA) + **Yana (TC Dental Lab)** — Dave added Yana himself from the phone.
- **Testing gotcha (cost real time this session, don't re-chase)**: the hidden Browser-pane test
  environment suspends `requestAnimationFrame`, which React 19's Suspense reveal batching waits on —
  pages look "unhydrated" (no fibers, dead clicks, content stuck in a hidden `S:0` div) in pane tests
  while perfectly healthy in real browsers/phone. Workaround: `window.$RV(window.$RB)` to force the
  reveal, or test on a visible browser/device.

## Swipe & perf specifics (2026-08-25 evening)

- Board rows have NO checkbox (per levr-swipe-prototype.html): swipe right past ~70px commits Done on
  release (green reveal); swipe left snaps open a red Delete that fires ONLY on a second deliberate tap;
  tap with a panel open just resets; plain tap opens the detail sheet. Touches starting <24px from the
  left screen edge are ignored (Safari back-swipe). No haptics (unsupported in iOS PWA). Component:
  `components/board/SwipeRow.tsx`; sheet trash + swipe delete share one handler.
- Perf: `loading.tsx` skeletons on all four routes; `experimental.staleTimes.dynamic=30` (safe because
  all mutations are Server Actions which invalidate the router cache); `vercel.json` pins functions to
  **pdx1** (Portland — same metro as Supabase us-west-2). Diagnosis notes: tab lag was blocking
  dynamic fetches + no loading boundary; Link/prefetch were never the problem.
- **Dev-over-LAN gotcha**: Next 16 dev 403s hydration chunks for non-localhost hosts → blank greeting
  + dead nav on the phone. Fixed via `allowedDevOrigins: ["192.168.0.229"]` in next.config.ts — update
  the IP if the PC's DHCP lease changes.

## Routing junction (2026-08-27, stages 1–5 complete; routing-junction-handoff.md)

- **One place ranks owners**: `lib/routing.ts` (pure core — `rankOwners`, `recommendFromSnapshot`,
  `topPick`) + `lib/routingServer.ts` (DB loader — `loadRoutingSnapshot`, `recommendOwner`; split so
  the service-role client never reaches the browser bundle, same pattern as trust.ts). LLMs no
  longer pick owners: `suggested_owner_id` + `recent_delegations` were removed from Tier 1/Tier 2
  prompts (A/B verified, 9 runs/variant, no is_leverage shift). `lib/routing.ts` is the ONLY
  writer-of-record logic for `entries.suggested_person_id` (persisted by Tier 1 classify, Tier 2
  recompute, and `rerouteSuggestion` — nothing else).
- **Score model**: earned trust window first (0.5–0.9 by landed ratio, floor 3 / window 5 via
  trust.ts), declared rating fallback (strong .6 / capable .45 / learning .25 / not_ready .05),
  unknown baseline .2; same-business +0.15, recent bandwidth chip −0.2; **flagged (.15) deliberately
  below unknown (.2)** — concrete failure evidence loses to absence of evidence, Dave-confirmed.
  Capacity partition first: at/over `people.capacity_limit` always ranks below everyone with room
  but stays listed ("at capacity"). Migration **011**: capacity_limit (null = no limit),
  `routing_recommendations`, `person_category_ratings` (declared/earned unique per source).
- **Stage 3** AssignSheet renders the ranked list (capacity + one reason per row, AI-pick badge on
  the top pick) + explore nudge (declared capable/strong, no earned window, under capacity, not the
  top pick) as a dashed aside — Try assigns, Not now is sheet-local. **Stage 4** PersonCard shows
  "N/M active" + fill bar (amber; red at/over limit; fraction never clamped); PersonForm 44px
  capacity stepper ("No limit" below 1, then 5–20). **Stage 5** override logging: one resolved
  `routing_recommendations` row per decision (recommended vs picked, score, reasons jsonb,
  via:"nudge"), badge-shown-only; reassigns and EntrySheet assignments unlogged by design.
- **Tests**: `npm test` (tsx + node:test) → `tests/routing.test.ts`, 25 passing.
- **Milestone (Dave)**: the stage-5 live test was the first end-to-end proof of the whole chain —
  declared rating → junction → Tier 1's real suggested_person_id. His verification bar, now the
  standard for every handoff: revert via the real UI (not DB edits), verify both states over REST,
  no fake data writes; non-UI tables may use disclosed disposable REST fixtures deleted after.

## Stale-pick trace + fixes (2026-08-28, commits `10f1f48`/`98940e0` → GitHub `7ae2bf7`/`539efa9`)

- **iOS long-press bug**: holding a board row for AssignSheet also triggered iOS's native
  text-selection loupe/handles — SwipeRow's `contextmenu` preventDefault never covered the separate
  selection gesture, and the only `user-select:none` in the app was on `.type-badge`. Fix: `.row-wrap`
  gets `user-select:none` + `-webkit-user-select:none` + `-webkit-touch-callout:none`, plus
  `removeAllRanges()` when the hold fires. Un-reproducible in desktop/emulated browsers — iOS only.
- **Stale-badge trace** (started from Dave's "AI pick on a business-None entry" report): EntrySheet's
  badge reads the PERSISTED `suggested_person_id`; AssignSheet computes live — the two can disagree,
  and that divergence is itself the cleanest stored-vs-live test. Three compounding causes found:
  (1) with business+category both null every candidate tied at the .2 baseline and the "pick" was
  the alphabetical tie-break wearing a confident badge; (2) `setEntryBusiness` (Home question
  fill-in) set business without rerouting, so the null-business pick survived; (3) the reported
  entry's VA pick was computed while a disposable stage-5 declared-rating fixture still existed —
  after cleanup it was unreproducible from live data.
- **Fixes shipped**: `decisive` flag on `RoutingResult` — false when the top spot fell to the name
  tie-break or a lone candidate has zero positive signal; `topPick` returns null on non-decisive
  results (nothing persists, EntrySheet badge disappears via the stored null, stage-5 logging goes
  silent with it), AssignSheet gates its badge on the flag. `rerouteSuggestion(entryId)` in
  routingServer.ts recomputes the stored pick from current classification; called from ALL four
  reclassification paths (`setEntryBusiness`, `applyReviewSuggestion` is_leverage + business,
  `saveEntry` on classificationChanged — after the delegation reconcile so capacity counts are
  current); fresh pick flows back through patches into BoardClient state. Never throws.
- **Backfill executed** (Dave-approved, script deleted after): 1 open unassigned delegated entry —
  the reported one — rerouted VA → Danny (not nulled: business was filled by then, so same-business
  is real signal and decisive). Live-verified: real `/api/classify` capture with no business
  persisted null in both tiers; the real "Which business?" UI answer set the business AND rerouted
  to Danny over REST. Test entries + checklist rows deleted, verified gone.

## Delegation Evolution specifics (2026-08-25 late night)

- **Schema (003)**: `categories` table (8-item starter vocabulary + `proposed` status),
  `entries.category/parked_until`, `delegations.category/confirm_first/diagnosis/flag_shown`,
  `app_settings.auto_notes`. Applied via db:migrate.
- **A1**: "Someone else? Type a name" in the Hand-off area; fuzzy match selects an existing person,
  else save creates a minimal people row (business inferred) and assigns in one action; toast reads
  "(no contact info yet)"; Team card shows a no-contact line. notify.ts skips quietly (`no_contact`).
- **A2**: Settings toggle "Auto-update capability notes" (OFF by default — still off, Dave hasn't
  opted in). When on, closeout fires lib/evolve.ts synthesizeNotes (sonnet, persona) which rewrites ONLY
  the portion below the "⸻ Levr's read ⸻" marker in capability_notes; manual text above is never touched.
- **A3**: Tier 1 + Tier 2 assign `category` from the active vocabulary at capture; closeout stamps it on
  the delegation (Haiku fallback categorize if null). lib/trust.ts: floor 3, window last 5, flag at 2+
  misses; ONLY diagnosis not_ready/no_follow_through count (legacy rows: not_done/pull_back). Trust line
  renders in the assignment sheet only; assigning despite a flag records the flag text (`flag_shown`).
  New-category proposals (status=proposed) surface in Review with Add/Dismiss.
- **A4**: 5 diagnosis chips at closeout (shown when outcome ≠ Done): unclear_brief / not_ready /
  bandwidth / blocked / no_follow_through. Chips 1/3/4 never touch trust evidence.
- **A5**: "Confirm with me first" toggle per assignment (off default); message becomes
  "⚠️ Confirm with Dave before starting — [task]" on all channels. NOTE: prefixed SMS not yet
  live-fired (test person had no phone) — first real confirm-first assignment is the live test.
- **A6**: decay = dashed amber row + "Needs a decision" chip when unsorted/unowned > 6 days and not
  parked; "Not now" in the sheet parks for 17 days (quiet "Parked" chip). Flat timer, tune later.
- Verified live on a prod build: Tier-1 categorization first-try, A1 create+assign, A4 chip persistence,
  A3 flag/floor/override logging, A6 decay+park, A2 synthesis (manual text preserved), proposal
  approve/dismiss. All test rows/people/categories deleted; auto_notes returned to off.

## Open items (for the record)

1. **Email notifications**: Resend integration built but `RESEND_API_KEY` is a placeholder — not live.
   Alternative discussed but undecided: Gmail-dedicated-account approach instead of Resend.
2. **Toll-free +18773204828**: verification rejected July 2025, never re-filed; SMS sends from the 503
   local number instead (see Notifications specifics).
3. **Team roster**: Danny + Yana exist — Stella and Chi still need to be added.
4. Slack channel needs `SLACK_WEBHOOK_URL` whenever a workspace is actually connected.
5. **A5 prefixed SMS**: the "⚠️ Confirm with Dave before starting" message hasn't been live-fired yet —
   verify delivery/wording on the first real confirm-first assignment.
6. **Auto-notes toggle**: still OFF (deliberate phase-in) — Dave flips it in Settings when ready.
7. **Placeholder project names**: Haiku once emitted a literal `<UNKNOWN>` as a chunk's `project` and `resolveProjectId` faithfully created a project row named `<UNKNOWN>` — `parseChunk` accepts any non-empty string as a project name; needs a guard against placeholder-looking names (junk row from testing already deleted).
8. **Routing junction deferred backlog** (from the stage-5 handoff, each its own stage later):
   declared-ratings add-time UI (nothing writes `person_category_ratings` yet); EntrySheet old
   owner picker alignment with the junction (its badge is now honest via the decisive gate, but it
   still shows plain pills — no reasons/capacity/nudge — and its assignments aren't override-logged);
   "shown-but-not-chosen" logging gap (revisit with real usage); CPA-split `is_leverage` ambiguity
   ("schedule meeting about tax strategy" splits ~50/50 under both prompts — pre-existing);
   advisory-persona wiring + weekly Sonnet audit + 20/80 self-check (separate handoffs).
9. **Pre-existing lint debt**: react-hooks/set-state-in-effect — BoardClient (3) + PersonForm (1).
10. **iOS long-press fix on-device confirmation**: `7ae2bf7` deployed + bundle-verified; Dave's
    real-iPhone check (no blue tint, no selection pin on row hold) still pending.
11. **Intent Router auto-open/toast timing** — not fully exercised live; hidden Browser pane
    environment suspends the rAF React needs to commit (known gotcha, same class as the earlier
    "unhydrated" testing issue). Worth a real-device check: ask a `consult` question, stay on
    Board, confirm it opens itself.
12. **Ambiguous-name candidate chip** — not yet triggered live; needs two same-first-name people
    on the roster to stage. Logic-reviewed only.
13. ~~Calendar view-count question~~ **RESOLVED 2026-08-30**: Dave decided all four views ship
    (Week live, Day live, Month + Calendar hour-grid still to build). No longer blocking.
