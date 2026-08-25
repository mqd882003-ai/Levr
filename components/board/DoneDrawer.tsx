"use client";

import { useState } from "react";
import EntryRow from "@/components/board/EntryRow";
import type { BoardEntry, Person } from "@/lib/types";

export default function DoneDrawer({
  entries,
  people,
  onToggleDone,
  onDelete,
  onOpen,
}: {
  entries: BoardEntry[];
  people: Person[];
  onToggleDone: (entry: BoardEntry) => void;
  onDelete: (entry: BoardEntry) => Promise<boolean>;
  onOpen: (entry: BoardEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!entries.length) return null;
  return (
    <div className="section">
      <button
        type="button"
        className={`done-toggle pressable${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Done · {entries.length}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`done-list${open ? " open" : ""}`}>
        {entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            people={people}
            flash={false}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
