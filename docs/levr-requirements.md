# Levr — Build Requirements v1

## What this is
A capture-and-delegate tool for busy entrepreneurs running multiple businesses. The person talks or types whatever's on their mind. The app sorts it into their 20% (high-leverage, do-it-themselves work) or their 80% (delegate-able), tracks who it's delegated to, and closes the loop on outcomes.

Reference files attached: `levr-mockup-v2.html` (structural/navigation direction — screens, nav, interaction flow) and `levr-app.html` (a working browser prototype with real AI classification and persistence — current visual/color direction). **`levr-app.html` supersedes `levr-mockup-v2.html` on visuals; the mockup still governs structure and navigation.** Where this doc and either file differ, this doc wins on structure/data, `levr-app.html` wins on visuals.

Note: `levr-app.html` is a throwaway prototype (client-side storage, no real backend) built to validate the concept quickly — it is not the codebase to extend. Treat it as a reference for look, feel, and interaction only.

## Non-negotiable product principle
The end user is busy and doesn't want to think about the tool. Every screen must be glanceable — read, act, move on. If a proposed feature adds a decision, a form field, or a setup step before someone gets value, cut it or defer it. No onboarding flow. No empty-state configuration screens.

## Stack (match existing project conventions)
- Next.js (App Router)
- Supabase (Postgres + Auth) — a Supabase project already exists for this; do not scaffold a new backend approach
- Deployed on Vercel
- Mobile-first responsive web (not native app for v1)

## Screens — functional requirements

### 1. Home (default screen on open)
- Personalized greeting keyed to time of day ("Morning, David." / "Evening, David." / late-night variant), plus one short, warm, contextual line — NOT generic ("Coffee's on. What's on your mind before it gets buried?" style). Rotate/vary this line; don't hardcode one string forever.
- One capture box: free text input + mic button for voice-to-text.
- No other UI elements compete on this screen. No lists, no tags, no stats.
- On submit (text or voice), the entry is sent for classification (see Classification Logic below) and the user is taken to Board, with the new item visibly highlighted at the top of the relevant section for a few seconds.

### 2. Board
- Two sections only: **Your 20%** and **Delegated**, in that order, top to bottom.
- Each row: checkbox + one line of text. Delegated rows also show a small owner avatar (initials).
- Checking a row marks it done (strikethrough + moves to a collapsed "done" state — does not need its own screen for v1, just visually deprioritize).
- Thin progress bar at top showing this week's % signal vs. noise (ratio of 20%-tagged to 80%-tagged entries).
- Scope filter at top (All / [Business 1] / [Business 2] / ...), driven dynamically by whatever businesses exist in the data — do not hardcode business names in the UI layer.
- No tags, no dense metadata, no multi-line cards. If a row needs more detail, that detail lives behind a tap-to-expand, not inline.

### 3. Team
- List of people the user delegates to, as cards: avatar (initials), name, role/business, and a simple live stat (e.g. "2 active").
- Tapping a person opens their full profile, which must include:
  - Editable basics: name, role, business, phone number, contact info.
  - **Preferred contact channel** — per person, one of the enabled channels (see Communication Channels section). Defaults to SMS.
  - **Quick actions** — "Call" and "Text" buttons using native `tel:` and `sms:` links against the stored phone number. This works identically on iOS and Android with no special permissions and is the primary way to reach someone directly from their profile — do not build this as a Contact-Picker-API integration (see note below).
  - **Delegation history** — a running list of past tasks assigned to this person, each showing what was asked, the outcome (done/not done, on time or not), and the verdict (fully-trust / needs-coaching / pull-back). This is not optional — it's the core reason a person profile exists beyond being a label.
  - **Capability notes** — a freeform, editable text field for observations that don't fit a single task record (e.g. "still learning the CRM," "strong on cold calls, weak on follow-up," "don't hand off anything client-facing yet"). The user can edit this directly at any time, and it should also be easy to update right after closing out a delegated task.
- "Add someone to delegate to" card at the bottom, always visible. Entry is manual (name/role/phone/business) — do not build an "import from phone contacts" flow as the primary add path; see note below on why.
- This is the person directory that Board's owner-avatars and delegation records reference.

**Note on phone contacts:** the browser API that would let a web app read the phone's native contacts (Contact Picker API) is effectively Android-Chrome-only — it is not available to regular users on iOS Safari as of 2026 (locked behind a developer experimental flag). Since this app is built iPhone-first, do not rely on this. Manual entry is the primary path; the Call/Text quick-action buttons above are what make a saved number actually useful without needing contact import.

## Communication channels
Team communicates primarily by text, not Slack — so channels are ranked by real-world usefulness, not by ease of integration.

- **SMS** — build in v1 (see Delegation Notifications section for the Twilio/A2P details). Default channel.
- **Email** — build in v1 as a straightforward fallback/alternative channel. No special compliance overhead like SMS; useful for people who prefer it or for longer task descriptions.
- **Slack** — build in v1 as *optional*, off by default. Only relevant for whichever team members are actually on a connected Slack workspace; per-person, this is only offered as a channel choice if Slack is connected in Settings.
- **WhatsApp, push notifications** — do not build in this pass. Show as visibly present but disabled/"coming soon" options in the channel settings UI (per the "gray it in as we go" direction), so the settings surface doesn't need restructuring later when they're added. WhatsApp matters more for anyone communicating internationally; push notifications only make sense once/if this becomes an installed app rather than a web app.
- Settings needs a "Communication channels" area: which channels are active, and the credentials/config for each (Twilio SID/token/number for SMS, an email sending config, a Slack webhook or bot token if connected). All credentials are server-side secrets, same handling as the Anthropic API key — never exposed to the client.

### 4. Settings
- Minimal for v1: name, businesses list, notification toggle, data storage indicator. No monetization, no theming options yet.

## Interaction model (the core loop — do not simplify away)
1. User captures (talks or types) on Home.
2. System classifies the entry:
   - New idea vs. belongs to an existing project (fuzzy-match against existing project names/descriptions in the data)
   - Which business it belongs to
   - 20% (user should do it) vs. 80% (delegate candidate) — best-guess, not user-specified
3. System silently commits its best guess to the database — it does NOT block the user with a multi-question form.
4. The guess is visible and correctable from Board (tap an item to fix its business/project/20-80 classification), but correction is never required before the item is usable.
5. For 80% items, the system may also guess a likely owner from Team based on that person's delegation history and capability notes — e.g. it should be able to weigh "this person has pulled back twice on similar tasks" or "capability notes say not ready for client-facing work" when suggesting or ruling out a candidate. Assigning an owner is still a deliberate user action, not automatic.
6. When a delegated item is marked done (or the user opens it to close it out), prompt for the outcome and verdict right there — this is what actually populates the person's delegation history instead of leaving it empty. Keep this prompt quick (a status + optional one-line note), not a form.

## Voice input
Do not rely on a custom mic button using the browser's Web Speech API as the primary way to capture voice. Support is inconsistent on iOS Safari and specifically breaks once the app is added to the home screen (the realistic way this gets used day to day) — it can work in a regular browser tab and fail silently as an installed PWA.

Instead: the text input is a plain, standard text field/textarea. The user's own phone keyboard already has a built-in dictation mic (iOS and Android both) — tapping into the field and using that native mic is the primary voice path, free and reliable, no engineering required. A custom in-app mic icon can still exist as a visual affordance/shortcut to focus the field, but must not be the only way voice works, and must fail gracefully (hide itself or do nothing harmful) on devices/contexts where the Web Speech API isn't available rather than erroring.

## Classification backend
- The classification call (business / project / leverage guess) must run server-side — a Next.js API route or Supabase Edge Function — never from the client. The real Anthropic API key is a server-side secret; it must never be shipped to or callable from the browser.
- Model: `claude-haiku-4-5-20251001`. This is a short, structured-output task (classify text into JSON) — it does not need Sonnet or Opus. Haiku 4.5 pricing as of writing: $1/M input tokens, $5/M output tokens — a single classification call runs a few hundred tokens, so cost stays negligible at personal-use volume. Do not upgrade the model without a concrete reason (e.g. accuracy problems after real usage).
- If a future feature needs deeper reasoning (e.g. evaluating whether a delegated task's actual outcome matched its expected outcome, or writing a nuanced weekly summary), that's a candidate for Sonnet — keep that decision isolated to whichever feature needs it, don't upgrade the classification call itself.

## Delegation notifications
Team primarily communicates by text, not Slack — SMS is the default notification channel for v1 (see Communication Channels section for the full picture: SMS, email, and optional Slack are all buildable now).

- When a task is assigned to someone from Board (the "Owner" action described in the interaction model), the system sends **one message**, via that person's preferred channel, containing the task text. This is the only automatic trigger — no recurring reminders, no digests, no automatic follow-ups. This must stay strictly opt-in-by-action: a message only goes out because David explicitly assigned that task to that person, not on any schedule.
- A separate, deliberate "send a check-in" action may exist later for stuck tasks, but it is a manual trigger the user initiates, never automatic. Do not build this in v1 unless requested.
- **A2P 10DLC:** this requires its own registered Twilio campaign, separate from the existing True Home Acquisitions lead-generation campaign, even though it can share the same verified brand. Category should reflect internal/operational notifications, not marketing — this is materially lower-risk traffic than the lead-gen campaign and should register faster, but it is not exempt from registration. Do not send unregistered A2P traffic; unregistered messages risk silent carrier filtering, which is worse for this use case than not texting at all, since the point is to know the assignment reliably reached the person.
- Twilio credentials (Account SID, Auth Token, sending number) are server-side secrets, configured in Settings, never exposed to the client — same handling as the Anthropic API key.

## Data model (Supabase — build against this shape, adjust types as needed)
- **entries**: id, text, business_id (nullable until classified), project_id (nullable), is_leverage (boolean, nullable until classified), status, captured_at, source (voice/text)
- **projects**: id, business_id, name, created_from_entry_id (nullable)
- **businesses**: id, name — dynamic, not hardcoded (currently True Home Acquisitions, TC Dental Lab, but must support adding more)
- **people**: id, name, role, business_id, phone_number, preferred_channel (sms/email/slack), contact info, capability_notes (freeform text, editable, accumulates over time)
- **delegations**: id, entry_id, person_id, expected_outcome, actual_outcome, verdict (fully-trust / needs-coaching / pull-back), outcome_note (short freeform text), assigned_at, resolved_at — this table IS the person's delegation history; the Team profile view queries it by person_id and renders it as a timeline, it is not a separate log to build

## Explicit non-goals for this pass
- Do not build a full analytics/reporting dashboard.
- Do not add user accounts/multi-tenant support — single user for now.
- Do not change the color system, typography, or navigation pattern from the mockup/prototype without flagging the change and reason first.
- Do not add onboarding, tutorials, or setup wizards.
- Do not build automatic/recurring notifications or digests on any channel — assignment-triggered single messages only.
- Do not build WhatsApp or push notification channels — show as disabled/"coming soon" in settings only, see Communication Channels section.
- Do not build a phone-contacts import flow — see the note under Team on why (iOS support gap), and use the Call/Text quick actions instead.

## Design tokens (light theme — supersedes any earlier dark version, don't reinvent)
- Background `#F7F5F0`, card surface `#FFFFFF` / `#F1EEE6`, border `#E3DFD4`
- Text: primary `#1C1D20`, muted `#6B6F76`, dim `#9DA1A8`
- Signal (20%/leverage) accent: `#C9891A` (text-safe variant `#8A5F10`, tint `#FBF0DA`)
- Noise (80%/delegate) accent: `#7C8591`, tint `#EDEFF1`
- Success/done: `#2E9A5C`, tint `#E4F5EA`
- Destructive: `#D8483F`, tint `#FBE9E7`
- Type: Space Grotesk (headers/display), Inter (body), JetBrains Mono (labels/data/counts)
- Bottom nav: Home / Board / Team / Settings, four items, fixed position, active state uses signal-text color
- Layout: comfortable spacing, not dense — generous padding (24–32px horizontal), rounded cards (12–20px radius), roomy touch targets. This is the #1 visual note from prototyping: earlier passes read as cramped and too dark, and both were explicitly called out as unusable.

## Known failure mode to avoid
The first working prototype broke completely (blank/unresponsive app) because of a single malformed escape sequence inside a JS string used to build the AI classification prompt — one bad character silently broke the entire script and nothing worked. Guardrails for the real build:
- Never hand-escape user-generated or dynamic text (names, business labels, captured entries) into string-concatenated JS or inline HTML attributes. Use `JSON.stringify()` for embedding text into prompts/payloads, and proper templating/escaping (React JSX handles this natively) for rendering.
- Avoid inline event handlers built from string interpolation (e.g. `onclick="fn('${dynamicValue}')"`) — bind event handlers programmatically instead, so a name or label containing an apostrophe or quote can't break the page.
- Because a single syntax error can take down an entire client-side app silently, the build should fail loudly in dev (lint/build step catches this) rather than shipping broken JS to production.

## Future direction (not v1 scope, do not build against this yet)
Long-term intent is to eventually wrap this as a native iOS app (likely via Capacitor rather than a separate Swift codebase, to reuse the web build) once the product is proven useful day to day. This does not require different architecture decisions now — a Capacitor-wrapped app still calls the same hosted backend over HTTPS, so the server-side API routes, Supabase backend, and secret-handling rules elsewhere in this doc already support that path. The one thing worth doing now because it's low-cost: ship a proper PWA manifest (icons, name, start_url, display: standalone) so the app installs cleanly to the home screen in the meantime. Do not build native-specific features (e.g. native contacts access) until this direction is actually greenlit.

## Phase 2 — Consultant-grade classification (DRAFT, pending approval)
This section is a proposed addition, not yet approved for build. It does not replace anything above — Home's silent, non-blocking capture (see Interaction Model) stays exactly as-is. This phase adds a deeper reasoning layer behind the scenes and one new, separate, user-initiated screen.

### Why
Today's classification (Haiku, single call) makes a reasonable guess at business/project/20-80 but has no persona, no memory of past corrections, and no ability to break a delegated item into steps. The goal is to evolve Levr from "a tool that sorts my thoughts" toward "a consultant that has learned how I actually run my businesses" — without ever slowing down or complicating the capture moment itself.

### 1. Two-tier classification pipeline
- **Tier 1 (unchanged):** Haiku 4.5 runs synchronously on capture, exactly as today — instant, silent, non-blocking. It resolves business/project, produces the clean summary, and commits a best-guess 20/80 immediately so the item is usable on Board right away.
- **Tier 2 (new):** immediately after Tier 1 commits, a second, asynchronous call to Sonnet runs in the background against the same entry. It can revise the 20/80 call, refine the business/project match, and — for anything landing in Delegated — generate a short checklist of concrete sub-steps. When Tier 2's result differs from Tier 1's guess, the entry updates in place (the item doesn't jump around or duplicate; if the user already acted on the Tier 1 guess, don't silently overwrite an in-progress state — surface the disagreement instead, e.g. a small "reclassified" indicator on the row rather than a silent flip).
- **Cost note:** Sonnet runs once per entry, async, off the critical path — negligible at personal-use volume, no impact on capture speed.

### 2. The persona
Tier 2's system prompt gives Sonnet an explicit role, rather than a bare instruction to output a boolean:

> You are an experienced business operations consultant and chief of staff for a busy, multi-business founder. Your job is to help them protect their time: flag what only they should personally handle (strategy, key decisions, judgment calls unique to their position), and what should be handed off to their team. You know their businesses, their team's track record, and how they've corrected your past calls — use all of it to make a sharper call than a first-pass guess would.

### 3. Checklists on delegated items
- A delegated entry can carry an ordered list of short sub-steps (generated by Tier 2, editable by the user).
- Each sub-step is a simple checkbox — check it done, or remove it — same lightweight interaction as marking a Board row done. No separate screen required; this lives inside the existing tap-to-expand detail view for a row.
- Data model addition needed: either a `checklist_items` table (entry_id, text, done, sort_order) or a JSON column on `entries` — worth Claude Code's judgment on which fits the existing schema better, flagged here rather than dictated.

### 4. Correction feedback loop
- Every time the user changes a business/project/20-80 tag, reassigns a suggested owner, or edits capability notes, that correction is recorded (not just applied) — e.g. a lightweight `corrections` log (entry text, what was guessed, what the user changed it to, timestamp).
- Recent corrections (a bounded, relevant window — not the entire history every time) get folded into future Tier 2 prompts, so the persona's calls sharpen over time based on this specific user's actual patterns, not a generic model.
- This is the mechanism behind "it learns about you" — not a vague background process, but this specific, inspectable log.

### 5. "Review with me" — on-demand audit mode
- A new, separate, user-initiated view (not part of capture, never automatic) where the user can ask the persona to review the current Board and flag what it thinks should change.
- The persona may ask up to 3 clarifying questions before giving its assessment, only in this mode — never during normal capture, which stays silent and non-blocking per the existing interaction model.
- Output: a short list of suggested reclassifications or delegation changes, each with a one-line reason. The user applies or dismisses each suggestion individually — nothing changes on Board automatically.
- Entry point: a button/action on the Board screen (e.g. "Review with me"), not a persistent UI element — keeps Board's default view exactly as clean as it is today.

### Open questions for Dave before build
- Checklist storage shape (new table vs. JSON column) — fine to leave to Claude Code's judgment, flagged above.
- Should "Review with me" be scoped to the current business filter (if you're viewing "TC Dental Lab" only, does it review just that), or always the whole Board? Default assumption: respects the current scope filter, same as everything else on Board.

## Addendum: Delegation Evolution (DRAFT, pending approval)
Proposed 2026-08-25. Extends people/entries/delegations — no new backend architecture. Build as its own focused session(s), stop-for-review pattern.

### A1. Assigning to someone not yet in Team
- Assignment flow accepts a typed name; fuzzy-match against `people.name`; no match → inline "[Name] isn't in your Team yet — add them?" → confirm creates a minimal people row (name only, business inferred from the entry) and completes the assignment in the same action. No form detour.
- Phone optional at creation; assignable/trackable without one — just no SMS/email until added. Profile shows a lightweight "no contact info" indicator; never blocks usage.

### A2. Auto-evolving capability notes from outcome history
- After each closeout, when a clear pattern exists in that person's recent history, propose/append a plain-language rolling capability summary (e.g. "Reliable on cold calls, 2 recent misses on client-facing tasks").
- Additive/mergeable with Dave's manual notes — NEVER overwrites his edits. Diagnostic tone per A4.

### A3. Per-category trust (build in this order)
1. Category tag per delegation ("cold calls", "client-facing", "CRM data entry", …) — inferred by the classifier where possible, manual optional, low-friction.
2. Minimum sample floor (3+ closed tasks in category) before any confidence read; below floor → "not enough history yet", never a false-early verdict.
3. Recency-weighted (last ~5 per category or simple decay), not all-time average.
4. Auto-generated summaries always traceable to the specific tasks behind them.
5. Surfaces ONLY inline in the assignment sheet at the moment of handing someone a task in that category — no dashboard, no nags.
6. Assigning despite a flag logs as its own data point — override adds data, never erases history.

### A4. Non-punitive verdict framing
- Closeout prompts + auto-notes favor diagnosis over judgment ("unclear brief", "needs more context", "timing conflict" over blunt trust downgrades). Copy/tone requirement across all verdict/notes UI strings. (~30% of initial delegations missing expectations is normal process, not exception.)

### A5. Escalation guidance at assignment time
- Optional single lightweight authority tag per assignment: "decide and go" vs "check with me first". Manual only in this pass — auto-suggestion is a future enhancement.

### A6. Decay signal for stalled/unassigned items
- Items unclassified or unassigned past an age threshold get a visible decay signal on Board (subtle highlight / "needs a decision" indicator). Rendering rule only — no new screen.

### Addendum non-goals
- No trust-scoring dashboard/analytics (inline only, per A3.5).
- Category tagging never blocks capture — inferred where possible, manual optional.
- Auto-notes never silently overwrite manual notes — merge/append only.
- No escalation auto-suggestion in this pass.

## Definition of done for this pass
A working mobile-web app where: a person can open it, see a greeting and a capture box with nothing else, talk or type a problem, have it classified and appear on Board under the right section, tap into Team to see/edit who they delegate to, and mark things done from Board. Nothing more.
