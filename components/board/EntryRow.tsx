"use client";

import SwipeRow from "@/components/board/SwipeRow";
import Avatar from "@/components/ui/Avatar";
import type { BoardEntry, Person } from "@/lib/types";

// No checkbox: swipe right to complete, swipe left to reveal Delete
// (levr-swipe-prototype.html). Tap opens the detail sheet.
export default function EntryRow({
  entry,
  people,
  flash,
  onToggleDone,
  onDelete,
  onOpen,
}: {
  entry: BoardEntry;
  people: Person[];
  flash: boolean;
  onToggleDone: (entry: BoardEntry) => void;
  onDelete: (entry: BoardEntry) => Promise<boolean>;
  onOpen: (entry: BoardEntry) => void;
}) {
  const kind =
    entry.isLeverage === true ? "lev" : entry.isLeverage === false ? "del" : "rev";
  const owner = entry.ownerId
    ? people.find((p) => p.id === entry.ownerId) ?? null
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
      rowClass={`row ${kind}${entry.done ? " done" : ""}${stale ? " stale" : ""}`}
      wrapClass={flash ? "flash" : ""}
      completeLabel={entry.done ? "Undo" : "Done"}
      onComplete={() => onToggleDone(entry)}
      onDelete={() => onDelete(entry)}
      onOpen={() => onOpen(entry)}
    >
      <div className="row-main">
        <div className="row-text">{entry.summary}</div>
        {(entry.businessName ||
          entry.projectName ||
          entry.checklist.length > 0 ||
          entry.tier2Status === "flagged" ||
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
            {stale && <span className="decide">Needs a decision</span>}
            {parked && <span className="parked-tag">Parked</span>}
          </div>
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
