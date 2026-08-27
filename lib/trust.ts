import type { TrustEvidence } from "@/lib/types";

// A3: per-category trust read. Pure function — used by the assignment sheet
// (inline flag) and recorded as flag_shown when Dave assigns despite it.
//
// A "miss" is only what A4 says counts: diagnosis chips not_ready /
// no_follow_through. Legacy rows without a diagnosis fall back to the old
// signals (not_done outcome or pull_back verdict). Chips 1/3/4 (unclear brief,
// bandwidth, blocked) never count against the person.
const SAMPLE_FLOOR = 3;
const WINDOW = 5;

export interface TrustRead {
  state: "none" | "insufficient" | "ok" | "flag";
  line: string | null; // mono one-liner for the sheet; null when state==="none"
  evidence: TrustEvidence[]; // the window rows behind the read (A3.4)
}

// Exported for lib/routing.ts, which turns the same window into a numeric
// landed-ratio — one definition of "miss", not two.
export function isMiss(d: TrustEvidence): boolean {
  if (d.diagnosis) return d.diagnosis === "not_ready" || d.diagnosis === "no_follow_through";
  return d.actual_outcome === "not_done" || d.verdict === "pull_back";
}

export function readTrust(
  all: TrustEvidence[],
  personId: string,
  category: string | null,
): TrustRead {
  if (!category) return { state: "none", line: null, evidence: [] };
  const rows = all
    .filter((d) => d.person_id === personId && d.category === category)
    .sort((a, b) => (a.resolved_at < b.resolved_at ? 1 : -1));
  if (rows.length < SAMPLE_FLOOR) {
    return {
      state: "insufficient",
      line: `${category}: not enough history yet`,
      evidence: rows,
    };
  }
  const window = rows.slice(0, WINDOW);
  const misses = window.filter(isMiss).length;
  const landed = window.length - misses;
  if (misses >= 2) {
    return {
      state: "flag",
      line: `${category}: ${misses} of last ${window.length} needed a rescue — coach or reconsider?`,
      evidence: window,
    };
  }
  return {
    state: "ok",
    line: `${category}: ${landed} of last ${window.length} landed`,
    evidence: window,
  };
}
