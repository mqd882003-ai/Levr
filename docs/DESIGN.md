# Levr — Design Spec v2

Source of truth for the visual system. Extracted from `reference/levr-app-v2.html` (the approved prototype). Where this file and the requirements doc (`levr-requirements.md`) conflict, the requirements doc wins on structure/data; this file wins on visuals.

Everything below is what's actually in the approved prototype — no aspirational values.

---

## 1. Color tokens

Light theme only for v1. Never use raw hex in components — always the token.

### Surfaces & lines
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F5F0` | App background (warm off-white) |
| `--card` | `#FFFFFF` | Card / sheet surface |
| `--card-2` | `#F1EEE6` | Inset surface: input fills, chips-off, collapsed done bar |
| `--line` | `#E3DFD4` | All borders and dividers, 1px (1.5px dashed for "add" affordances) |

### Text
| Token | Hex | Use |
|---|---|---|
| `--text` | `#1C1D20` | Primary text, filled primary buttons |
| `--muted` | `#6B6F76` | Secondary text (roles, subtitles) |
| `--dim` | `#9DA1A8` | Tertiary: mono labels, counts, placeholders, empty states |

### Semantic accents (each has a tint for backgrounds)
| Meaning | Accent | Text-safe | Tint |
|---|---|---|---|
| Signal / Your 20% / leverage | `--signal` `#C9891A` | `--signal-text` `#8A5F10` | `--signal-tint` `#FBF0DA` |
| Noise / Delegated | `--noise` `#7C8591` | (use `--muted`) | `--noise-tint` `#EDEFF1` |
| Success / done / trust | `--good` `#2E9A5C` | same | `--good-tint` `#E4F5EA` |
| Destructive / needs-review / pull-back | `--bad` `#D8483F` | same | `--bad-tint` `#FBE9E7` |

**Rules**
- `--signal` (amber) is the identity color: pulsing dot, active nav, focus ring, progress fill, section swatch. Use `--signal-text` for amber text on light backgrounds (contrast); raw `--signal` only for fills/dots ≥ small-shape size.
- Tints are backgrounds only, always paired with their accent or text-safe color as foreground.
- Avatars use a hash-picked tint from: `#FBF0DA #EDEFF1 #E4F5EA #FBE9E7 #EEE8F7 #E3EFF8` (stable per person id).
- Gradient allowed in exactly one place: progress-bar fill `linear-gradient(90deg, #C9891A, #E2A63E)`.

## 2. Typography

| Token | Stack | Role |
|---|---|---|
| `--display` | `'Space Grotesk', system-ui, sans-serif` | Headings, screen titles, names, sheet titles. Weights 500/600/700 |
| `--body` | `'Inter', system-ui, sans-serif` | Body, rows, inputs, buttons. Weights 400/500/600 |
| `--mono` | `'JetBrains Mono', ui-monospace, monospace` | Labels, counts, timestamps, eyebrows, chips, badges. Weights 400/500 |

Google Fonts import: `Space+Grotesk:wght@500;600;700`, `Inter:wght@400;500;600`, `JetBrains+Mono:wght@400;500`.

### Scale (mobile)
| Element | Font | Size / weight | Notes |
|---|---|---|---|
| Home greeting | display | `clamp(32px, 9vw, 40px)` / 700 | line-height 1.12, letter-spacing −0.02em |
| Screen title (topbar) | display | 30px / 700 | letter-spacing −0.02em |
| Sheet title | display | 22px / 700 | |
| Section heading | display | 18px / 600 | |
| Person name | display | 17px / 600 | |
| Greeting sub | body | 17px / 400 | color `--muted`, max-width 34ch |
| Capture textarea | body | 18px | caret-color `--signal` |
| Row text | body | 16px / 400 | line-height 1.4 |
| Inputs | body | 16px | never smaller — prevents iOS zoom-on-focus |
| Buttons | body | 15–15.5px / 600 | |
| Mono labels/eyebrows | mono | 11–12px, uppercase | letter-spacing .1em–.12em |
| Badges/tags | mono | 10–10.5px, uppercase | |

Body base: 16px / 1.5. `-webkit-font-smoothing: antialiased`.

## 3. Spacing, radius, elevation

- Horizontal page padding: `--px: 24px` (single value, everywhere).
- Vertical rhythm: sections separated 22–28px; cards stacked with 8–10px gaps.
- Radii: `--r-sm 12px` (inputs, small buttons) · `--r-md 16px` (rows, action buttons) · `--r-lg 20px` (cards, person cards) · `--r-xl 28px` (capture box, sheet top corners) · `100px` (pills, chips, toast, switches).
- Shadows (only two):
  - `--shadow-card`: `0 1px 2px rgba(28,29,32,.04), 0 8px 24px -12px rgba(28,29,32,.10)` — resting cards.
  - `--shadow-float`: `0 12px 40px -8px rgba(28,29,32,.22)` — sheet and toast only.
- Max app width 520px, centered; ≥520px viewport gets a 1px `--line` outline around the device column.
- Safe areas: `env(safe-area-inset-bottom)` on nav and sheet padding; `env(safe-area-inset-top)` on screen/topbar padding. `--nav-h: calc(72px + env(safe-area-inset-bottom))`; every screen bottom-pads `--nav-h + 24px`.

## 4. Motion

- Signature easing: `--ease: cubic-bezier(.16, 1, .3, 1)` (expo-out) for all entrances/transforms.
- Press feedback: `.pressable` → `scale(.97)` on `:active`, 180ms.
- Screen change: fade + 6px rise, 320ms.
- Sheet: slides from bottom 360ms `--ease`; backdrop `rgba(28,29,32,.42)` fades 250ms.
- New board row: `flash` — signal-tint background + 3px tint ring + drop-in (−8px, scale .98), holds ~2.2s then fades.
- Progress bar fill: width transition 800ms `--ease` (animate on render via rAF).
- Ambient: home glow blobs drift 14s alternate; greeting dot `pulse` ring 2.8s; mic listening state pulses red 1.2s.
- Send button: fades/slides in only when input has text (200/250ms).
- Checkbox check: svg scales .5→1 with opacity, 200ms.
- Everything collapses to ~0ms under `prefers-reduced-motion: reduce`.

## 5. Components

### Bottom nav
Fixed, 4 items in a grid (Home / Board / Team / Settings). Background `rgba(247,245,240,.88)` + `backdrop-filter: blur(18px) saturate(1.4)`, top border `--line`. Items: 22px stroke icon + 10px uppercase mono label, `--dim`; active = `--signal-text` plus a 20×3px amber notch hanging from the top border. Item hit area 56px tall.

### Capture box (Home)
`--card` surface, `--r-xl`, 1px `--line`, `--shadow-card`. Focus-within: border → 55% signal, ring `0 0 0 4px --signal-tint`. Textarea autosizes (max 40vh). Row below: mono hint text ("Tap the mic on your keyboard to talk") + hidden-until-typed "Levr, go" pill (dark, 52px) + mic circle (52px, signal-tint bg, signal-text icon; red + pulse while listening). Status line beneath is mono 12px with an inline spinner while sorting.

### Scope chips (Board)
Horizontal scroll row, no scrollbar, scroll-snap. Chip: 44px tall pill, `--card` bg, mono 12px, with a dimmer count number. Active: `--text` bg, white text. Dynamic from businesses — never hardcoded.

### Pulse card (weekly signal bar)
Card with "THIS WEEK" mono label, `x of y captured` (x in signal-text), 8px track (`--noise-tint`) with gradient fill, footer `n% signal` / `n% noise`.

### Board row
Card row, `--r-md`, with a 3px left accent bar inset 10px top/bottom: signal-amber for 20%, noise-gray for delegated, red for needs-review. Layout: 44×44 checkbox hit area (visible box 24px, radius 8; checked = `--good` fill + white check) · text block (summary 16px; meta line of mono 11px business/project) · owner avatar 30px (initials on tint; dashed "+" circle when unassigned). Done rows: strikethrough `--dim`, live inside a collapsed "Done · n" drawer (inset `--card-2` toggle bar with rotating chevron).

### Empty states
Dashed 1.5px `--line` border, `--r-md`, centered: bold display one-liner + dim explainer. Written in product voice ("Nothing only you can do right now.").

### Person card (Team)
`--r-lg` card: 50px tinted-initials avatar (display font) · name + "Role · Business" · right-aligned big mono active-count (signal-text; dim when 0). "Add someone to delegate to" = dashed card with plus icon.

### Bottom sheet (the only modal)
Slides to max-height 90dvh, `--r-xl` top corners, grab handle (40×5 pill), header = title + optional sub + 40px circular close. Used for: entry edit, person profile, person form, delegation closeout. Backdrop tap closes.

### Sheet form controls
- Labels: mono 11px uppercase dim, above field.
- Inputs/selects/textareas: `--card-2` fill, 1px `--line`, `--r-sm`, min-height 48px, 16px text; focus → signal border + white fill. Selects get a custom chevron (appearance:none).
- Segmented choices (`.seg`): equal-flex 48px buttons; selected states use semantic tint+border+text (`on-signal`, `on-noise`, `on-good`, `on-warn`, `on-bad`).
- Owner picker: avatar pills (44px, avatar 32px); selected = dark fill; AI-suggested owner wears a floating `AI pick` amber mini-badge.
- Actions: 52px buttons — `btn-primary` (dark), `btn-ghost` (card-2 + line), `btn-danger` (bad-tint, icon-only allowed with aria-label).

### Person profile (sheet)
64px avatar header + Edit pill. Call/Text row: two 50px link-buttons (`tel:` dark, `sms:` signal-tint) — 40% opacity + disabled until a phone number exists, with a hint line. Capability notes in an inset text block. Delegation history: left-rail timeline (2px `--line`), 12px node dots colored by verdict (good/amber/red, hollow gray when open), each item = task text + badge row (outcome, verdict, date) + italic quoted note.

### Closeout prompt ("How did it go?")
Two segmented rows — Outcome: Done (good) / Done-late (warn) / Not done (bad); Verdict: Fully trust / Needs coaching / Pull back — plus optional one-line note. Skip is always available. Quick, not a form.

### Badges (`.verdict`)
Mono 10.5px uppercase pills: trust=good-tint/good, coach=signal-tint/signal-text, pull=bad-tint/bad, open=noise-tint/muted.

### Toast
Dark pill bottom-center above nav, white 14px text, optional leading semantic dot, `--shadow-float`, ~2.2s, slide-up in/out.

### Switch
50×30 pill, `--line` off / `--good` on, 24px white knob, 220ms `--ease`. Disabled = 40% opacity ("coming soon" channels pair it with a `Soon` tag).

## 6. Iconography

Stroke SVGs only (Feather-style): `viewBox="0 0 24 24"`, `stroke-width 2` (2.2–2.5 for small glyphs), round caps/joins, `currentColor`. Nav icons 22px, inline icons 16–20px. **No emoji as icons.** Icon-only buttons always get `aria-label`.

## 7. Interaction & accessibility rules

- Touch targets ≥ 44×44px (checkbox/mic/send/chips/nav/switches all comply); ≥8px gaps between adjacent targets.
- `:focus-visible`: 2px `--signal` outline, offset 2px, on every interactive element.
- `aria-live="polite"` on the capture status; `role="dialog" aria-modal` on sheet; `role="switch"` + `aria-checked` on toggles; `role="tablist/tab"` + `aria-selected` on scope chips.
- `inputmode`/`type`/`autocomplete` set per field (`tel` for phones); `enterkeyhint="send"` on capture.
- Overscroll contained (`overscroll-behavior`); no horizontal page scroll ever; `-webkit-tap-highlight-color: transparent` (press feedback comes from `.pressable`).
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`. Never disable zoom.

## 8. Voice & microcopy

Warm, direct, second person, zero productivity jargon. Greeting rotates per time band ("Coffee's on. What's on your mind before it gets buried?"). Empty states reassure, not instruct. Toasts confirm in plain words ("Filed under Your 20%", "Logged to their history"). Buttons are verbs: **Levr, go**, **Log it**, **Save**, **Skip**.

## 9. Engineering guardrails (carried from requirements)

- No string-interpolated inline handlers; DOM built via `createElement`/`textContent`; events delegated via `data-action`. In the Next.js build JSX handles this natively — the rule stands for any raw-DOM code.
- Dynamic text into prompts only via `JSON.stringify`.
- Classification server-side (`claude-haiku-4-5-20251001`); prototype's client call + heuristic fallback is throwaway.
- All credentials server-side secrets.

---

## 9b. Build additions (2026-08-25 polish pass — deltas from the prototype)

Approved-identity refinements added in the real build; everything else above still holds.

- **Token nudge:** `--dim` `#9DA1A8` → `#8F949C` (tertiary-text contrast ~2.7:1 → ~3.2:1 on `--bg`; same temperature).
- **Token nudge:** `--bg` `#F7F5F0` → `#FBF9F4` (Dave asked for a brighter background; same warm hue). Nav backdrop, theme-color, and manifest colors track it.
- **Quick-add FAB (Board only):** 56px dark circle, fixed bottom-right above the nav (inside the 520px column), opens the Home capture flow in the bottom sheet ("Quick add"); after classify it lands on Board with the usual flash+toast. From `levr-ux-proposals-v2.html`.
- **Dormant search slot:** 36px `--card-2` circle with a stroke magnifier in the Board and Team topbars; no search yet — tapping toasts "Search is coming soon". Reserved so the topbar never restructures.
- **Team hint card:** contextual one-liner card above the person list ("Checking in, or adding someone? …"); Team deliberately has no capture box.
- **Paper grain:** ultra-subtle SVG turbulence baked into the body background (cards sit on top clean).
- **Time-adaptive home glow:** the ambient blobs shift per greeting band (`morning` warmer amber, `evening` amber+violet, `late` violet-led) via `data-band` on `.home-glow`.
- **Motion additions** (all expo-out, all collapse under `prefers-reduced-motion`): staggered Home entrance (eyebrow→title→sub→capture→status, ~70ms steps); board rows cascade in (delay capped after 4); checkbox `checkPop` overshoot; nav notch `notchIn` scaleX; toast overshoot entrance; sheet grab-handle widens when open.
- **Capture box:** amber gradient hairline centered on the top edge (brightens on focus); mic button gets a soft radial highlight; send arrow nudges on hover.
- **Pulse bar:** faint ticks at 25/50/75; one-time shimmer sweep on the fill after it lands.
- **Empty states:** may carry a 28px stroke doodle above the headline (mug for Your 20%, paper plane for Delegated) in `--dim`.

## 9c. Delegation Evolution additions (2026-08-25, approved addendum)

- **Trust line** (assignment sheet, A3.5): mono 11.5px line under the owner picker. Healthy/floor reads
  are `--dim` plain text; a flag becomes a signal-tint pill block (`--signal-tint` bg, `--signal-text`,
  amber border) — the only place trust surfaces, ever.
- **Someone-else input** (A1): reuses the `.check-add` input+button row under the people pills; a staged
  new person renders as a selected (dark) pill + a one-line muted note beneath.
- **Confirm-first row** (A5): inset `--card-2` row with the standard switch; label + 12px dim explainer.
- **Diagnosis chips** (A4): pill buttons (13.5px, `--card-2`/`--line`); selected = `--noise-tint` bg,
  `--noise` border, text `--text` 600. Shown only when the closeout outcome isn't a clean Done.
- **Decay signal** (A6): row border goes dashed `rgba(201,137,26,.45)` + mono meta chip "Needs a
  decision" in signal-tint. **Parked**: quiet `--card-2` mono chip "Parked"; no other emphasis.
- **No-contact indicator** (A1): second `.p-role` line on Team cards, `--signal-text` 12px,
  "No contact info yet".
- Category proposals ride the existing Review sheet `.sug-item` cards with Add category / Dismiss.

## 10. Target folder tree (Next.js App Router build)

```
levr/
├── docs/
│   ├── levr-requirements.md      # product requirements (source of truth, structure/data)
│   └── DESIGN.md                 # this file (source of truth, visuals)
├── reference/
│   ├── levr-app-v1.html          # original throwaway prototype
│   └── levr-app-v2.html          # approved visual prototype — look/feel/interaction reference
├── app/
│   ├── layout.tsx                # fonts (next/font), theme-color, PWA manifest link
│   ├── globals.css               # §1–§4 tokens as CSS variables
│   ├── page.tsx                  # Home (capture)
│   ├── board/page.tsx
│   ├── team/page.tsx
│   ├── settings/page.tsx
│   ├── manifest.ts               # PWA: name, icons, start_url, display: standalone
│   └── api/
│       ├── classify/route.ts     # server-side Haiku call (Anthropic key stays here)
│       └── notify/route.ts       # single assignment message: Twilio SMS / email / Slack
├── components/
│   ├── nav/BottomNav.tsx
│   ├── capture/{CaptureBox,Greeting}.tsx
│   ├── board/{ScopeChips,PulseBar,BoardSection,EntryRow,DoneDrawer}.tsx
│   ├── team/{PersonCard,PersonProfile,PersonForm,HistoryTimeline}.tsx
│   ├── sheets/{Sheet,EntrySheet,CloseoutSheet}.tsx
│   └── ui/{Chip,Seg,Switch,Toast,Avatar,VerdictBadge,Field}.tsx
├── lib/
│   ├── supabase/{client,server}.ts
│   ├── classify.ts               # prompt builder (JSON.stringify embedding)
│   ├── channels/{sms,email,slack}.ts
│   └── types.ts                  # entries/projects/businesses/people/delegations
├── supabase/
│   └── migrations/               # schema per requirements §Data model
├── public/
│   └── icons/                    # PWA icons
└── .env.local                    # ANTHROPIC_API_KEY, SUPABASE_*, TWILIO_* (never committed)
```

Stack: Next.js (App Router) + Supabase (existing project) + Vercel. Mobile-first web; PWA manifest in v1; Capacitor wrap later — no architecture change needed.
