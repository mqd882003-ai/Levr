"use client";

import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { SheetHead } from "@/components/sheets/Sheet";
import type { BoardEntry, Person } from "@/lib/types";

// Long-press assign/reassign sheet (board-gestures-handoff.md §3). Tapping a
// chip assigns immediately — no confirmation step, because unlike the shelved
// command box there's no ambiguity: the user pressed the exact row. All
// side effects (delegation row, notification with quiet-skips, correction
// logging) come from the existing saveEntry path upstream in BoardClient —
// this component only picks the person.
export default function AssignSheet({
  entry,
  people,
  saving,
  onPick,
  onAddNew,
  onClose,
}: {
  entry: BoardEntry;
  people: Person[];
  saving: boolean;
  onPick: (ownerId: string) => void;
  onAddNew: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");

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
