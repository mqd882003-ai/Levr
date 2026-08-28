import { isMiss, readTrust } from "@/lib/trust";
import type {
  Category,
  Person,
  PersonCategoryRating,
  RatingLevel,
  RatingSource,
  TrustEvidence,
} from "@/lib/types";

// Routing junction (routing-junction-handoff.md §2). One place that reads all
// existing signals — per-category trust (lib/trust.ts, unchanged), declared/
// earned ratings (011), bandwidth chips, capacity — and emits a ranked owner
// recommendation. Recommendation only: assigning stays a deliberate user
// action, and this module's read path writes nothing.
//
// Lookup order per the 2026-08-27 decisions: earned signal first (the real
// trust window, once the floor of 3 resolved delegations in the category is
// crossed), declared rating as the cold-start fallback, neutral baseline when
// neither exists.

// A bandwidth diagnosis chip is about the person's overall load, not the
// category, so any recent one penalizes them everywhere. Same shape of logic
// as trust.ts's window: recency-bounded, then it stops counting.
export const BANDWIDTH_WINDOW_DAYS = 7;

// Score model. Trust ratios land in 0.5–0.9 so a proven track record always
// clears a declared-only rating (max 0.6), which in turn clears the unknown
// baseline — but a same-business unknown can still edge a cross-business
// declared 'learning'. Flagged trust ranks below everything except not_ready.
//
// DELIBERATE (confirmed with Dave 2026-08-27): flagged (0.15) scores below
// the unknown baseline (0.2). A flag is 2+ rescues in the last 5 in exactly
// this category — concrete recent evidence of failure — while unknown is
// merely absence of evidence, so the conservative primary pick avoids the one
// candidate it has affirmative reason to avoid before gambling on a stranger.
// The 0.05 gap is small on purpose: same-business (+0.15) still lifts a
// flagged local teammate above a cross-business unknown, so flagged people
// aren't buried categorically — it just takes another real signal.
const TRUST_OK_BASE = 0.5;
const TRUST_OK_SPREAD = 0.4;
const TRUST_FLAG_SCORE = 0.15;
const DECLARED_SCORE: Record<RatingLevel, number> = {
  strong: 0.6,
  capable: 0.45,
  learning: 0.25,
  not_ready: 0.05,
};
const UNKNOWN_BASELINE = 0.2;
const SAME_BUSINESS_BONUS = 0.15;
const BANDWIDTH_PENALTY = 0.2;

// Everything the UI needs to render "Danny — 6/8 open, strong on cold-calls"
// instead of a bare name. Persisted verbatim into routing_recommendations.reasons.
export interface RecommendationReasons {
  trust: number | null; // landed/window ratio when an earned window exists
  trust_state: "none" | "insufficient" | "ok" | "flag";
  trust_line: string | null;
  rating: { level: RatingLevel; source: RatingSource } | null;
  capacity: string; // "6/8", or "6/—" when no limit is set
  capacity_full: boolean;
  same_business: boolean;
  bandwidth_flag: boolean;
  category_fit: boolean; // any category-specific signal existed (earned or rated)
}

export interface OwnerRecommendation {
  personId: string;
  score: number;
  reasons: RecommendationReasons;
}

export interface RoutingResult {
  entryId: string;
  ranked: OwnerRecommendation[];
  // Explore nudge (decisions §explore-vs-exploit): a plausible-but-unproven
  // candidate — declared capable/strong in this category, no earned window
  // yet, under capacity, not already the top pick. An invitation for the UI
  // to phrase, never a replacement for the conservative top pick.
  nudge: OwnerRecommendation | null;
  // False when the top spot was settled by the alphabetical name tie-break
  // (or a lone candidate carries no positive signal at all). The ranking is
  // still a usable picker order, but it is not a recommendation: no AI-pick
  // badge, and topPick refuses to surface or persist it (2026-08-28 decision
  // — a confident badge must never dress up an alphabetical accident).
  decisive: boolean;
}

// Rating rows pre-scoped to the entry's category, so the pure core never
// touches category_id↔name mapping (the loader resolves it).
export interface ScopedRating {
  person_id: string;
  level: RatingLevel;
  source: RatingSource;
}

export interface RoutingInput {
  entryId: string;
  businessId: string | null;
  category: string | null;
  people: Person[];
  evidence: TrustEvidence[]; // resolved delegations, same rows trust.ts reads
  ratings: ScopedRating[]; // person_category_ratings for THIS category only
  activeCounts: Record<string, number>; // open delegations on open entries
  now: Date;
}

function pickRating(ratings: ScopedRating[], personId: string): ScopedRating | null {
  const mine = ratings.filter((r) => r.person_id === personId);
  // Earned first, declared as fallback — mirrors the junction's lookup order.
  return mine.find((r) => r.source === "earned") ?? mine.find((r) => r.source === "declared") ?? null;
}

function hasRecentBandwidthFlag(evidence: TrustEvidence[], personId: string, now: Date): boolean {
  const cutoff = now.getTime() - BANDWIDTH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return evidence.some(
    (d) =>
      d.person_id === personId &&
      d.diagnosis === "bandwidth" &&
      new Date(d.resolved_at).getTime() >= cutoff,
  );
}

function scoreCandidate(person: Person, input: RoutingInput): OwnerRecommendation {
  const active = input.activeCounts[person.id] ?? 0;
  const limit = person.capacity_limit;
  const capacityFull = limit !== null && active >= limit;

  const trust = readTrust(input.evidence, person.id, input.category);
  const rating = pickRating(input.ratings, person.id);

  let base: number;
  let trustRatio: number | null = null;
  if (trust.state === "ok" || trust.state === "flag") {
    const misses = trust.evidence.filter(isMiss).length;
    trustRatio = trust.evidence.length ? (trust.evidence.length - misses) / trust.evidence.length : 0;
    base = trust.state === "ok" ? TRUST_OK_BASE + TRUST_OK_SPREAD * trustRatio : TRUST_FLAG_SCORE;
  } else {
    // "none" AND "insufficient" (1-2 in category, below trust.ts's floor of
    // 3) both land here: below the floor we refuse to judge the sample either
    // way — readTrust's own philosophy — so 1-2 early misses can't bury
    // someone and 1-2 early wins can't crown them. The declared rating (or
    // the neutral baseline) carries the score instead; reasons.trust_state
    // still surfaces "insufficient" so the sheet can say "not enough history
    // yet". They also stay nudge-eligible — see rankOwners.
    base = rating ? DECLARED_SCORE[rating.level] : UNKNOWN_BASELINE;
  }

  const sameBusiness = input.businessId !== null && person.business_id === input.businessId;
  const bandwidthFlag = hasRecentBandwidthFlag(input.evidence, person.id, input.now);
  const score =
    Math.round(
      (base + (sameBusiness ? SAME_BUSINESS_BONUS : 0) - (bandwidthFlag ? BANDWIDTH_PENALTY : 0)) *
        1000,
    ) / 1000;

  return {
    personId: person.id,
    score,
    reasons: {
      trust: trustRatio,
      trust_state: trust.state,
      trust_line: trust.line,
      rating: rating ? { level: rating.level, source: rating.source } : null,
      capacity: `${active}/${limit ?? "—"}`,
      capacity_full: capacityFull,
      same_business: sameBusiness,
      bandwidth_flag: bandwidthFlag,
      category_fit: trust.state === "ok" || trust.state === "flag" || rating !== null,
    },
  };
}

// Pure core — everything above the DB. Deterministic: capacity partition
// first (at/over limit always ranks below everyone with room, but stays in
// the list so the sheet can say "Danny — at capacity"), then score, then
// same-business, then name for a stable order.
export function rankOwners(input: RoutingInput): RoutingResult {
  const scored = input.people.map((p) => ({
    person: p,
    rec: scoreCandidate(p, input),
  }));

  scored.sort((a, b) => {
    if (a.rec.reasons.capacity_full !== b.rec.reasons.capacity_full) {
      return a.rec.reasons.capacity_full ? 1 : -1;
    }
    if (a.rec.score !== b.rec.score) return b.rec.score - a.rec.score;
    if (a.rec.reasons.same_business !== b.rec.reasons.same_business) {
      return a.rec.reasons.same_business ? -1 : 1;
    }
    return a.person.name.localeCompare(b.person.name);
  });

  const ranked = scored.map((s) => s.rec);
  const topId = ranked[0]?.personId ?? null;

  // Decisive = the winner strictly beat the runner-up on a real comparator
  // leg (capacity partition, score, same-business) — if all three tie, the
  // order above fell through to localeCompare and means nothing. A lone
  // candidate needs some positive signal (category fit or same business)
  // before a bare unknown baseline reads as a pick.
  const top = scored[0] ?? null;
  const runner = scored[1] ?? null;
  const decisive = top
    ? runner
      ? top.rec.reasons.capacity_full !== runner.rec.reasons.capacity_full ||
        top.rec.score !== runner.rec.score ||
        top.rec.reasons.same_business !== runner.rec.reasons.same_business
      : top.rec.reasons.category_fit || top.rec.reasons.same_business
    : false;

  // Never nudge someone at/over their limit, regardless of category fit
  // (decision 2026-08-27). "Unproven" = no earned trust window in this
  // category; "plausible" = Dave declared them capable or strong at add-time.
  // "insufficient" (1-2 delegations, below the floor) counts as unproven on
  // purpose: nudging them toward the floor of 3 is exactly how they graduate
  // to an earned read.
  let nudge: OwnerRecommendation | null = null;
  if (input.category) {
    const candidates = scored.filter(
      (s) =>
        s.rec.personId !== topId &&
        !s.rec.reasons.capacity_full &&
        s.rec.reasons.trust_state !== "ok" &&
        s.rec.reasons.trust_state !== "flag" &&
        s.rec.reasons.rating !== null &&
        s.rec.reasons.rating.source === "declared" &&
        (s.rec.reasons.rating.level === "capable" || s.rec.reasons.rating.level === "strong"),
    );
    candidates.sort(
      (a, b) =>
        DECLARED_SCORE[b.rec.reasons.rating!.level] - DECLARED_SCORE[a.rec.reasons.rating!.level] ||
        b.rec.score - a.rec.score,
    );
    nudge = candidates[0]?.rec ?? null;
  }

  return { entryId: input.entryId, ranked, nudge, decisive };
}

// One load of every signal the junction reads, reusable across the chunks of
// a single capture (the classify route ranks up to MAX_CHUNKS entries from
// one snapshot instead of re-querying per chunk). Loaded server-side by
// lib/routingServer.ts; this module stays pure (same split as trust.ts) so
// client components can rank from a snapshot they were handed.
export interface RoutingSnapshot {
  people: Person[];
  evidence: TrustEvidence[];
  activeCounts: Record<string, number>;
  categories: Category[];
  ratings: PersonCategoryRating[];
}

export function recommendFromSnapshot(
  snap: RoutingSnapshot,
  entryId: string,
  businessId: string | null,
  category: string | null,
): RoutingResult {
  // entries.category / delegations.category store the name; ratings key on id.
  const categoryId = category
    ? (snap.categories.find((c) => c.name === category)?.id ?? null)
    : null;
  const ratings: ScopedRating[] = categoryId
    ? snap.ratings
        .filter((r) => r.category_id === categoryId)
        .map((r) => ({ person_id: r.person_id, level: r.level, source: r.source }))
    : [];
  return rankOwners({
    entryId,
    businessId,
    category,
    people: snap.people,
    evidence: snap.evidence,
    ratings,
    activeCounts: snap.activeCounts,
    now: new Date(),
  });
}

// The single id worth persisting to entries.suggested_person_id: the top pick,
// unless everyone is at capacity — a full plate is never "the suggestion" —
// or the result is non-decisive — an alphabetical tie-break is not one either.
export function topPick(result: RoutingResult): OwnerRecommendation | null {
  const first = result.ranked[0];
  return first && !first.reasons.capacity_full && result.decisive ? first : null;
}
