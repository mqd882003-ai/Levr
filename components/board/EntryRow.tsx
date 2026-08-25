"use client";

import Avatar from "@/components/ui/Avatar";
import type { BoardEntry, Person } from "@/lib/types";

export default function EntryRow({
  entry,
  people,
  flash,
  onToggleDone,
  onOpen,
}: {
  entry: BoardEntry;
  people: Person[];
  flash: boolean;
  onToggleDone: (entry: BoardEntry) => void;
  onOpen: (entry: BoardEntry) => void;
}) {
  const kind =
    entry.isLeverage === true ? "lev" : entry.isLeverage === false ? "del" : "rev";
  const owner = entry.ownerId
    ? people.find((p) => p.id === entry.ownerId) ?? null
    : null;

  return (
    <div
      id={`row-${entry.id}`}
      className={`row ${kind}${entry.done ? " done" : ""}${flash ? " flash" : ""}`}
    >
      <button
        type="button"
        className="cb"
        onClick={() => onToggleDone(entry)}
        aria-label={entry.done ? "Mark not done" : "Mark done"}
      >
        <span className="box">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      </button>
      <button type="button" className="row-main" onClick={() => onOpen(entry)}>
        <div className="row-text">{entry.summary}</div>
        {(entry.businessName ||
          entry.projectName ||
          entry.checklist.length > 0 ||
          entry.tier2Status === "flagged") && (
          <div className="row-meta">
            {entry.businessName && <span className="biz">{entry.businessName}</span>}
            {entry.projectName && <span>{entry.projectName}</span>}
            {entry.checklist.length > 0 && (
              <span className="steps">
                {entry.checklist.filter((c) => c.done).length}/{entry.checklist.length} steps
              </span>
            )}
            {entry.tier2Status === "flagged" && <span className="reclass">Reclassify?</span>}
          </div>
        )}
      </button>
      {entry.isLeverage === false &&
        (owner ? (
          <Avatar id={owner.id} name={owner.name} className="owner" />
        ) : (
          <span className="owner empty-owner" title="Assign">
            +
          </span>
        ))}
    </div>
  );
}
