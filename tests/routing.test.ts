import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankOwners, type RoutingInput } from "@/lib/routing";
import type { Person, TrustEvidence } from "@/lib/types";

// Fixture-driven tests for the pure routing core (stage 1 of
// routing-junction-handoff.md). The DB loader is a thin mapping over the same
// queries the Team card and board page already run — the ranking logic is
// what's worth pinning down.

const NOW = new Date("2026-08-27T12:00:00Z");
const THA = "biz-tha";
const DENTAL = "biz-dental";
const CATEGORY = "Cold calls";

function person(id: string, name: string, businessId: string | null, capacity: number | null): Person {
  return {
    id,
    name,
    role: null,
    business_id: businessId,
    phone_number: null,
    email: null,
    preferred_channel: "sms",
    capability_notes: "",
    capacity_limit: capacity,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function resolved(
  personId: string,
  daysAgo: number,
  opts: Partial<Pick<TrustEvidence, "category" | "diagnosis" | "actual_outcome" | "verdict">> = {},
): TrustEvidence {
  return {
    person_id: personId,
    category: opts.category ?? CATEGORY,
    resolved_at: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    actual_outcome: opts.actual_outcome ?? "done",
    verdict: opts.verdict ?? "fully_trust",
    diagnosis: opts.diagnosis ?? null,
    expected_outcome: null,
  };
}

function input(overrides: Partial<RoutingInput>): RoutingInput {
  return {
    entryId: "entry-1",
    businessId: THA,
    category: CATEGORY,
    people: [],
    evidence: [],
    ratings: [],
    activeCounts: {},
    now: NOW,
    ...overrides,
  };
}

describe("rankOwners — scoring", () => {
  it("earned track record outranks a declared-only rating", () => {
    const danny = person("danny", "Danny", THA, null);
    const yana = person("yana", "Yana", THA, null);
    const result = rankOwners(
      input({
        people: [yana, danny],
        evidence: [1, 2, 3, 4, 5].map((d) => resolved("danny", d)),
        ratings: [{ person_id: "yana", level: "strong", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "danny");
    assert.equal(result.ranked[0].reasons.trust_state, "ok");
    assert.equal(result.ranked[0].reasons.trust, 1);
    assert.equal(result.ranked[1].reasons.rating?.level, "strong");
    assert.equal(result.ranked[1].reasons.rating?.source, "declared");
  });

  it("a flagged trust window ranks below a declared capable candidate", () => {
    const flagged = person("flagged", "Flagged", THA, null);
    const fresh = person("fresh", "Fresh", THA, null);
    const result = rankOwners(
      input({
        people: [flagged, fresh],
        evidence: [
          resolved("flagged", 1, { diagnosis: "not_ready" }),
          resolved("flagged", 2, { diagnosis: "no_follow_through" }),
          resolved("flagged", 3),
          resolved("flagged", 4),
          resolved("flagged", 5),
        ],
        ratings: [{ person_id: "fresh", level: "capable", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "fresh");
    assert.equal(result.ranked[1].reasons.trust_state, "flag");
    assert.equal(result.ranked[1].reasons.trust, 3 / 5);
  });

  it("chips that never count against trust (bandwidth, blocked, unclear_brief) don't drag the ratio", () => {
    const p = person("p", "P", THA, null);
    const result = rankOwners(
      input({
        people: [p],
        evidence: [
          resolved("p", 20, { diagnosis: "bandwidth" }), // old — no recency penalty either
          resolved("p", 21, { diagnosis: "blocked" }),
          resolved("p", 22, { diagnosis: "unclear_brief" }),
        ],
      }),
    );
    assert.equal(result.ranked[0].reasons.trust_state, "ok");
    assert.equal(result.ranked[0].reasons.trust, 1);
    assert.equal(result.ranked[0].reasons.bandwidth_flag, false);
  });

  it("an unknown same-business person can edge a cross-business declared learner", () => {
    const unknown = person("unknown", "Unknown", THA, null); // 0.2 + 0.15
    const learner = person("learner", "Learner", DENTAL, null); // 0.25
    const result = rankOwners(
      input({
        people: [learner, unknown],
        ratings: [{ person_id: "learner", level: "learning", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "unknown");
    assert.equal(result.ranked[0].reasons.same_business, true);
    assert.equal(result.ranked[0].reasons.category_fit, false);
  });
});

describe("rankOwners — below-floor (insufficient) trust", () => {
  it("1-2 delegations score via the declared fallback, not as an earned window", () => {
    const partial = person("partial", "Partial", THA, null);
    const result = rankOwners(
      input({
        people: [partial],
        evidence: [1, 2].map((d) => resolved("partial", d)), // 2 wins — below floor of 3
        ratings: [{ person_id: "partial", level: "capable", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].reasons.trust_state, "insufficient");
    assert.equal(result.ranked[0].reasons.trust, null); // no earned ratio below the floor
    // Score comes from the declared rating (0.45 + same-biz 0.15), not from
    // the 2-for-2 record — early wins can't crown someone.
    assert.equal(result.ranked[0].score, 0.6);
  });

  it("below-floor misses don't tank the score — the floor protects small samples", () => {
    const stumbled = person("stumbled", "Stumbled", THA, null); // 2 early misses, below floor
    const flagged = person("flagged", "Flagged", THA, null); // 2 misses in a full window
    const result = rankOwners(
      input({
        people: [stumbled, flagged],
        evidence: [
          resolved("stumbled", 1, { diagnosis: "not_ready" }),
          resolved("stumbled", 2, { diagnosis: "no_follow_through" }),
          resolved("flagged", 1, { diagnosis: "not_ready" }),
          resolved("flagged", 2, { diagnosis: "no_follow_through" }),
          resolved("flagged", 3),
          resolved("flagged", 4),
          resolved("flagged", 5),
        ],
      }),
    );
    // Same 2 misses, but below the floor they score the unknown baseline
    // while a full flagged window scores below it.
    assert.equal(result.ranked[0].personId, "stumbled");
    assert.equal(result.ranked[0].reasons.trust_state, "insufficient");
    assert.equal(result.ranked[1].reasons.trust_state, "flag");
  });

  it("insufficient + declared capable is still nudge-eligible — the nudge is how they cross the floor", () => {
    const proven = person("proven", "Proven", THA, null);
    const partial = person("partial", "Partial", THA, null);
    const result = rankOwners(
      input({
        people: [proven, partial],
        evidence: [
          ...[1, 2, 3].map((d) => resolved("proven", d)),
          ...[1, 2].map((d) => resolved("partial", d)), // below floor
        ],
        ratings: [{ person_id: "partial", level: "capable", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "proven");
    assert.equal(result.nudge?.personId, "partial");
  });
});

describe("rankOwners — flag vs unknown (deliberate ordering)", () => {
  it("concrete negative evidence (flag) ranks below absence of evidence (unknown)", () => {
    const flagged = person("flagged", "Flagged", THA, null);
    const unknown = person("unknown", "Unknown", THA, null);
    const result = rankOwners(
      input({
        people: [flagged, unknown],
        evidence: [
          resolved("flagged", 1, { diagnosis: "not_ready" }),
          resolved("flagged", 2, { diagnosis: "no_follow_through" }),
          resolved("flagged", 3),
          resolved("flagged", 4),
          resolved("flagged", 5),
        ],
      }),
    );
    assert.equal(result.ranked[0].personId, "unknown");
    // Zero history in a real category still reads "insufficient" from
    // readTrust ("none" is reserved for category-less entries).
    assert.equal(result.ranked[0].reasons.trust_state, "insufficient");
    assert.equal(result.ranked[1].reasons.trust_state, "flag");
  });

  it("but same-business still lifts a flagged local above a cross-business unknown", () => {
    const flagged = person("flagged", "Flagged", THA, null); // 0.15 + 0.15
    const unknown = person("unknown", "Unknown", DENTAL, null); // 0.2
    const result = rankOwners(
      input({
        people: [flagged, unknown],
        evidence: [
          resolved("flagged", 1, { diagnosis: "not_ready" }),
          resolved("flagged", 2, { diagnosis: "no_follow_through" }),
          resolved("flagged", 3),
          resolved("flagged", 4),
          resolved("flagged", 5),
        ],
      }),
    );
    assert.equal(result.ranked[0].personId, "flagged");
  });
});

describe("rankOwners — capacity", () => {
  it("at/over capacity always ranks below everyone with room, but stays in the list", () => {
    const star = person("star", "Star", THA, 5); // perfect record, but full
    const rookie = person("rookie", "Rookie", THA, 5);
    const result = rankOwners(
      input({
        people: [star, rookie],
        evidence: [1, 2, 3, 4, 5].map((d) => resolved("star", d)),
        activeCounts: { star: 5, rookie: 1 },
      }),
    );
    assert.equal(result.ranked[0].personId, "rookie");
    assert.equal(result.ranked.length, 2);
    assert.equal(result.ranked[1].reasons.capacity_full, true);
    assert.equal(result.ranked[1].reasons.capacity, "5/5");
  });

  it("null capacity_limit means no limit — never capacity_full", () => {
    const p = person("p", "P", THA, null);
    const result = rankOwners(input({ people: [p], activeCounts: { p: 40 } }));
    assert.equal(result.ranked[0].reasons.capacity_full, false);
    assert.equal(result.ranked[0].reasons.capacity, "40/—");
  });
});

describe("rankOwners — bandwidth recency", () => {
  it("a bandwidth chip inside the window penalizes; an older one doesn't", () => {
    const recent = person("recent", "Recent", THA, null);
    const old = person("old", "Old", THA, null);
    const result = rankOwners(
      input({
        people: [recent, old],
        evidence: [
          // Identical strong records in-category…
          ...[1, 2, 3].map((d) => resolved("recent", d)),
          ...[1, 2, 3].map((d) => resolved("old", d)),
          // …but one flagged bandwidth 3 days ago (other category — still counts:
          // bandwidth is about the person's load, not the category)…
          resolved("recent", 3, { category: "Scheduling", diagnosis: "bandwidth" }),
          // …and one 10 days ago, outside the 7-day window.
          resolved("old", 10, { category: "Scheduling", diagnosis: "bandwidth" }),
        ],
      }),
    );
    const byId = Object.fromEntries(result.ranked.map((r) => [r.personId, r]));
    assert.equal(byId.recent.reasons.bandwidth_flag, true);
    assert.equal(byId.old.reasons.bandwidth_flag, false);
    assert.equal(result.ranked[0].personId, "old");
  });
});

describe("rankOwners — explore nudge", () => {
  it("surfaces a declared-but-unproven candidate alongside the top pick", () => {
    const proven = person("proven", "Proven", THA, null);
    const yana = person("yana", "Yana", DENTAL, null);
    const result = rankOwners(
      input({
        people: [proven, yana],
        evidence: [1, 2, 3].map((d) => resolved("proven", d)),
        ratings: [{ person_id: "yana", level: "capable", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "proven");
    assert.equal(result.nudge?.personId, "yana");
  });

  it("never nudges someone at capacity, regardless of fit", () => {
    const proven = person("proven", "Proven", THA, null);
    const yana = person("yana", "Yana", DENTAL, 3);
    const result = rankOwners(
      input({
        people: [proven, yana],
        evidence: [1, 2, 3].map((d) => resolved("proven", d)),
        ratings: [{ person_id: "yana", level: "strong", source: "declared" }],
        activeCounts: { yana: 3 },
      }),
    );
    assert.equal(result.nudge, null);
  });

  it("the top pick is never also the nudge", () => {
    const yana = person("yana", "Yana", THA, null);
    const result = rankOwners(
      input({
        people: [yana],
        ratings: [{ person_id: "yana", level: "strong", source: "declared" }],
      }),
    );
    assert.equal(result.ranked[0].personId, "yana");
    assert.equal(result.nudge, null);
  });

  it("no category, no nudge — and ranking still works on business + baseline", () => {
    const a = person("a", "A", THA, null);
    const b = person("b", "B", DENTAL, null);
    const result = rankOwners(input({ category: null, people: [b, a] }));
    assert.equal(result.nudge, null);
    assert.equal(result.ranked[0].personId, "a"); // same-business bonus
    assert.equal(result.ranked[0].reasons.trust_state, "none");
  });

  it("a declared 'learning' rating is not enough to nudge", () => {
    const proven = person("proven", "Proven", THA, null);
    const learner = person("learner", "Learner", THA, null);
    const result = rankOwners(
      input({
        people: [proven, learner],
        evidence: [1, 2, 3].map((d) => resolved("proven", d)),
        ratings: [{ person_id: "learner", level: "learning", source: "declared" }],
      }),
    );
    assert.equal(result.nudge, null);
  });
});

describe("rankOwners — edges", () => {
  it("empty team returns an empty ranking and no nudge", () => {
    const result = rankOwners(input({ people: [] }));
    assert.deepEqual(result.ranked, []);
    assert.equal(result.nudge, null);
    assert.equal(result.entryId, "entry-1");
  });

  it("ordering is deterministic on full ties (name)", () => {
    const b = person("b", "Bea", THA, null);
    const a = person("a", "Al", THA, null);
    const r1 = rankOwners(input({ people: [b, a] }));
    const r2 = rankOwners(input({ people: [a, b] }));
    assert.deepEqual(
      r1.ranked.map((r) => r.personId),
      r2.ranked.map((r) => r.personId),
    );
    assert.equal(r1.ranked[0].personId, "a");
  });
});
