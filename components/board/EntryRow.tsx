"use client";

import { useState } from "react";
import SwipeRow from "@/components/board/SwipeRow";
import Avatar from "@/components/ui/Avatar";
import { parseIntentPayload } from "@/lib/intentPayload";
import type { BoardEntry, Person } from "@/lib/types";

// Intent router (handoff §4/§6): the confirm chip's callbacks. Confirm may
// carry a personId when the chip asked which person (ambiguous match).
export interface IntentHandlers {
  onConfirm: (entry: BoardEntry, personId?: string) => void;
  onKeepAsTask: (entry: BoardEntry) => void;
  onClear: (entry: BoardEntry) => void;
}

// No checkbox: swipe right to complete, swipe left to reveal Delete
// (levr-swipe-prototype.html). Tap opens the detail sheet.
export default function EntryRow({
  entry,
  people,
  flash,
  onToggleDone,
  onDelete,
  onOpen,
  onLongPress,
  onToggleType,
  typeToggleable = false,
  intentHandlers,
}: {
  entry: BoardEntry;
  people: Person[];
  flash: boolean;
  onToggleDone: (entry: BoardEntry) => void;
  onDelete: (entry: BoardEntry) => Promise<boolean>;
  onOpen: (entry: BoardEntry) => void;
  // Gesture round (board-gestures-handoff.md): hold → assign sheet; badge
  // tap → type toggle. Absent (DoneDrawer) = gestures off for that list.
  onLongPress?: (entry: BoardEntry) => void;
  onToggleType?: (entry: BoardEntry) => void;
  // false for personal_project businesses (no one to delegate to — same
  // rule that hides the EntrySheet toggle) — badge renders static.
  typeToggleable?: boolean;
  intentHandlers?: IntentHandlers;
}) {
  // Gap 3: "No" never resolves silently — it flips the chip to the soft
  // keep-or-clear follow-up instead.
  const [chipStage, setChipStage] = useState<"ask" | "followup">("ask");
  const kind =
    entry.isLeverage === true ? "lev" : entry.isLeverage === false ? "del" : "rev";
  const owner = entry.ownerId
    ? people.find((p) => p.id === entry.ownerId) ?? null
    : null;

  // Universal processing state (handoff §5): any row Tier 2 hasn't finished
  // with reads as visibly unresolved — never silently looks final when it
  // isn't. Acting on it anyway is fine; the user's action always wins.
  const processing = !entry.done && entry.tier2Status === null;

  // Intent confirm chip (handoff §4): pending person_note / outcome_report.
  // The chip only renders when handlers were passed (pendingIntent check);
  // the no-op fallback just keeps the closures below simply typed.
  const handlers: IntentHandlers = intentHandlers ?? {
    onConfirm: () => {},
    onKeepAsTask: () => {},
    onClear: () => {},
  };
  const payload = parseIntentPayload(entry.intentPayload);
  const pendingIntent =
    !entry.done &&
    entry.intentStatus === "pending_confirm" &&
    intentHandlers &&
    (entry.captureIntent === "person_note" || entry.captureIntent === "outcome_report")
      ? entry.captureIntent
      : null;
  const chipQuestion = pendingIntent
    ? payload.candidates
      ? `Which ${payload.aliasText ?? "person"} did you mean?`
      : pendingIntent === "person_note"
        ? `Add to ${payload.personName ?? "their"}'s notes?`
        : `Close out "${payload.taskText || "that task"}" for ${payload.personName ?? "them"}?`
    : null;

  // A6: decay signal — unsorted or unowned, sitting untouched past the flat
  // timer, and not deliberately parked.
  const DECAY_MS = 6 * 86400000;
  const parked = Boolean(
    entry.parkedUntil && new Date(entry.parkedUntil).getTime() > Date.now(),
  );
  const stale =
    !entry.done &&
    !parked &&
    (entry.isLeverage === null || (entry.isLeverage === false && !entry.ownerId)) &&
    Date.now() - new Date(entry.capturedAt).getTime() > DECAY_MS;

  return (
    <SwipeRow
      rowId={`row-${entry.id}`}
      rowClass={`row ${kind}${entry.done ? " done" : ""}${stale ? " stale" : ""}${processing ? " processing" : ""}`}
      wrapClass={flash ? "flash" : ""}
      completeLabel={entry.done ? "Undo" : "Done"}
      onComplete={() => onToggleDone(entry)}
      onDelete={() => onDelete(entry)}
      onOpen={() => onOpen(entry)}
      onLongPress={onLongPress && !entry.done ? () => onLongPress(entry) : undefined}
    >
      <div className="row-main">
        <div className="row-text">{entry.summary}</div>
        {(entry.businessName ||
          entry.projectName ||
          entry.checklist.length > 0 ||
          entry.tier2Status === "flagged" ||
          entry.captureIntent === "decision" ||
          processing ||
          stale ||
          parked) && (
          <div className="row-meta">
            {entry.businessName && <span className="biz">{entry.businessName}</span>}
            {entry.projectName && <span>{entry.projectName}</span>}
            {entry.checklist.length > 0 && (
              <span className="steps">
                {entry.checklist.filter((c) => c.done).length}/{entry.checklist.length} steps
              </span>
            )}
            {entry.tier2Status === "flagged" && <span className="reclass">Reclassify?</span>}
            {entry.captureIntent === "decision" && (
              <span className="decision-tag">Decision</span>
            )}
            {processing && <span className="processing-tag">Still sorting…</span>}
            {stale && <span className="decide">Needs a decision</span>}
            {parked && <span className="parked-tag">Parked</span>}
          </div>
        )}
        {pendingIntent && chipQuestion && (
          <div
            className="intent-chip"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {chipStage === "ask" ? (
              <>
                <span className="intent-q">{chipQuestion}</span>
                <div className="intent-actions">
                  {payload.candidates ? (
                    <>
                      {payload.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="pressable yes"
                          onClick={() => handlers.onConfirm(entry, c.id)}
                        >
                          {c.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="pressable"
                        onClick={() => setChipStage("followup")}
                      >
                        Neither
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pressable yes"
                        onClick={() => handlers.onConfirm(entry)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="pressable"
                        onClick={() => setChipStage("followup")}
                      >
                        No
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="intent-q">
                  Got it — keep this as a regular task, or clear it?
                </span>
                <div className="intent-actions">
                  <button
                    type="button"
                    className="pressable yes"
                    onClick={() => handlers.onKeepAsTask(entry)}
                  >
                    Keep as task
                  </button>
                  <button
                    type="button"
                    className="pressable"
                    onClick={() => handlers.onClear(entry)}
                  >
                    Clear it
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {entry.isLeverage !== null && !entry.done && onToggleType && (
          <button
            type="button"
            className={`type-badge ${kind === "lev" ? "signal" : "noise"}${
              typeToggleable ? "" : " static"
            }`}
            disabled={!typeToggleable}
            aria-label={
              typeToggleable
                ? `Switch to ${kind === "lev" ? "Delegate" : "Your 20%"}`
                : undefined
            }
            onClick={(e) => {
              e.stopPropagation();
              if (typeToggleable) onToggleType(entry);
            }}
          >
            <span className="dot" />
            {kind === "lev" ? "Your 20%" : "Delegate"}
          </button>
        )}
      </div>
      {entry.isLeverage === false &&
        (owner ? (
          <Avatar id={owner.id} name={owner.name} className="owner" />
        ) : (
          <span className="owner empty-owner" title="Assign">
            +
          </span>
        ))}
    </SwipeRow>
  );
}
