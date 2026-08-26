"use client";

import type { Delegation, DelegationStage } from "@/lib/types";

// HANDOFF task 4: businesses with a multi-stage pipeline (e.g. Danny's volume
// -> appointment -> close at True Home Acquisitions) track progression via
// delegations.stage instead of the plain done/not-done outcome.
const STAGE_LABEL: Record<DelegationStage, string> = {
  assigned: "Assigned",
  contacted: "Contacted",
  appointment_set: "Appointment set",
  closed: "Closed",
  lost: "Lost",
};
const STAGE_BADGE: Record<DelegationStage, "trust" | "coach" | "pull" | "open"> = {
  assigned: "open",
  contacted: "coach",
  appointment_set: "coach",
  closed: "trust",
  lost: "pull",
};

// The delegations table IS the history — rendered as the left-rail timeline
// (DESIGN.md §5 Person profile). Node color follows the verdict.
export default function HistoryTimeline({ items }: { items: Delegation[] }) {
  if (!items.length) {
    return (
      <div className="empty">Nothing delegated yet. Assign them something from Board.</div>
    );
  }
  return (
    <div className="hist">
      {items.map((d) => {
        const nodeCls =
          d.verdict === "fully_trust"
            ? "v-trust"
            : d.verdict === "needs_coaching"
              ? "v-coach"
              : d.verdict === "pull_back"
                ? "v-pull"
                : "v-open";
        const outcome = d.stage
          ? ([STAGE_BADGE[d.stage], STAGE_LABEL[d.stage]] as const)
          : d.resolved_at
            ? d.actual_outcome === "done"
              ? (["trust", "Done"] as const)
              : d.actual_outcome === "late"
                ? (["coach", "Late"] as const)
                : (["pull", "Not done"] as const)
            : (["open", "Open"] as const);
        return (
          <div key={d.id} className={`hist-item ${nodeCls}`}>
            <div className="hist-text">{d.expected_outcome ?? "—"}</div>
            <div className="hist-meta">
              <span className={`verdict ${outcome[0]}`}>{outcome[1]}</span>
              {d.verdict && (
                <span className={`verdict ${nodeCls.slice(2)}`}>
                  {d.verdict === "fully_trust"
                    ? "Fully trust"
                    : d.verdict === "needs_coaching"
                      ? "Needs coaching"
                      : "Pull back"}
                </span>
              )}
              <span className="verdict open">
                {new Date(d.assigned_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            {d.outcome_note && <div className="hist-note">“{d.outcome_note}”</div>}
          </div>
        );
      })}
    </div>
  );
}
