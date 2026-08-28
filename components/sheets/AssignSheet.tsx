"use client";

import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { SheetHead } from "@/components/sheets/Sheet";
import type { OwnerRecommendation, RoutingResult } from "@/lib/routing";
import type { BoardEntry, Person } from "@/lib/types";

// Long-press assign/reassign sheet (board-gestures-handoff.md §3). Tapping a
// chip assigns immediately — no confirmation step, because unlike the shelved
// command box there's no ambiguity: the user pressed the exact row. All
// side effects (delegation row, notification with quiet-skips, correction
// logging) come from the existing saveEntry path upstream in BoardClient —
// this component only picks the person.
//
// Routing junction (stage 3): when `routing` is provided, the picker renders
// the junction's ranked list — capacity + top reason under each name, the
// existing AI-pick badge on the top pick — plus the explore nudge as an
// aside below the list. Without `routing` it falls back to the original flat
// chips, so call sites not yet wired keep their old behavior.

// "N/M open" per the person card idiom; bare "N open" when no limit is set.
function capacityLabel(rec: OwnerRecommendation): string {
  const [active, limit] = rec.reasons.capacity.split("/");
  return limit === "—" ? `${active} open` : `${rec.reasons.capacity} open`;
}

// The one reason worth a line, in the junction's own priority order: earned
// trust first, then the declared/earned rating, then same-business. Never
// more than one — the sheet is a picker, not a report.
function reasonLabel(rec: OwnerRecommendation, category: string | null): string | null {
  const r = rec.reasons;
  if (r.capacity_full) return "at capacity";
  if (category && r.trust_state === "ok") {
    return (r.trust ?? 0) >= 0.8 ? `strong on ${category}` : `mixed record on ${category}`;
  }
  if (category && r.trust_state === "flag") return `recent rescues on ${category}`;
  if (category && r.rating) {
    const level = r.rating.level.replace("_", " ");
    return r.rating.source === "declared" ? `marked ${level} on ${category}` : `${level} on ${category}`;
  }
  if (r.same_business) return "same business";
  return null;
}

export default function AssignSheet({
  entry,
  people,
  routing = null,
  saving,
  onPick,
  onAddNew,
  onClose,
}: {
  entry: BoardEntry;
  people: Person[];
  routing?: RoutingResult | null;
  saving: boolean;
  // viaNudge tells the caller the pick came through the explore nudge's
  // "Try" button — same assignment, different signal for override logging.
  onPick: (ownerId: string, opts?: { viaNudge?: boolean }) => void;
  onAddNew: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  // Rule 4: "Not now" lives and dies with this sheet open — no persistence.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const personById = new Map(people.map((p) => [p.id, p]));
  const ranked = routing
    ? routing.ranked.filter((r) => personById.has(r.personId))
    : null;
  const nudge =
    routing?.nudge &&
    !nudgeDismissed &&
    routing.nudge.personId !== entry.ownerId &&
    personById.has(routing.nudge.personId)
      ? routing.nudge
      : null;
  const nudgePerson = nudge ? personById.get(nudge.personId) : undefined;

  const submitNew = () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    // Same guard as the EntrySheet input: a typed name matching an existing
    // person is that person, not a duplicate row.
    const existing = people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) onPick(existing.id);
    else onAddNew(trimmed);
  };

  return (
    <>
      <SheetHead
        title={entry.ownerId ? "Reassign" : "Hand off to"}
        onClose={onClose}
      />
      <div className="assign-context">&ldquo;{entry.summary}&rdquo;</div>
      {ranked ? (
        <div className="people-pick ranked">
          {ranked.map((rec, i) => {
            const p = personById.get(rec.personId)!;
            const reason = reasonLabel(rec, entry.category);
            return (
              <button
                key={p.id}
                type="button"
                className={`pressable${entry.ownerId === p.id ? " on" : ""}${
                  i === 0 && !entry.ownerId && !rec.reasons.capacity_full ? " suggest" : ""
                }`}
                disabled={saving}
                onClick={() => onPick(p.id)}
              >
                <Avatar id={p.id} name={p.name} />
                <span className="pick-body">
                  <span className="pick-name">{p.name}</span>
                  <span className="pick-meta">
                    {capacityLabel(rec)}
                    {reason ? ` · ${reason}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="people-pick">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pressable${entry.ownerId === p.id ? " on" : ""}${
                entry.suggestedPersonId === p.id && !entry.ownerId ? " suggest" : ""
              }`}
              disabled={saving}
              onClick={() => onPick(p.id)}
            >
              <Avatar id={p.id} name={p.name} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {nudge && nudgePerson && (
        <div className="nudge">
          <div className="nudge-text">
            💡 {nudgePerson.name} hasn&apos;t proven {entry.category ?? "this"} yet
            {nudge.reasons.rating
              ? ` — but you've marked them ${nudge.reasons.rating.level.replace("_", " ")}`
              : ""}
            . Want to try them?
          </div>
          <div className="nudge-actions">
            <button
              type="button"
              className="try pressable"
              disabled={saving}
              onClick={() => onPick(nudge.personId, { viaNudge: true })}
            >
              Try {nudgePerson.name}
            </button>
            <button type="button" className="pressable" onClick={() => setNudgeDismissed(true)}>
              Not now
            </button>
          </div>
        </div>
      )}
      <div className="check-add" style={{ marginTop: 12 }}>
        <input
          value={name}
          placeholder={people.length ? "Someone else? Type a name" : "Type a name to hand off to"}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
          }}
        />
        <button type="button" disabled={saving || !name.trim()} onClick={submitNew}>
          Add
        </button>
      </div>
    </>
  );
}
