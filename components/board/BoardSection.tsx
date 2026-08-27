"use client";

import EntryRow from "@/components/board/EntryRow";
import type { BoardEntry, Person } from "@/lib/types";

export default function BoardSection({
  title,
  swatch,
  entries,
  people,
  emptyTitle,
  emptySub,
  emptyIcon,
  flashId,
  onToggleDone,
  onDelete,
  onOpen,
  onLongPress,
  onToggleType,
  isTypeToggleable,
}: {
  title: string;
  swatch: "signal" | "noise" | "review";
  entries: BoardEntry[];
  people: Person[];
  emptyTitle?: string;
  emptySub?: string;
  emptyIcon?: React.ReactNode;
  flashId: string | null;
  onToggleDone: (entry: BoardEntry) => void;
  onDelete: (entry: BoardEntry) => Promise<boolean>;
  onOpen: (entry: BoardEntry) => void;
  onLongPress?: (entry: BoardEntry) => void;
  onToggleType?: (entry: BoardEntry) => void;
  isTypeToggleable?: (entry: BoardEntry) => boolean;
}) {
  return (
    <div className="section">
      <div className="section-h">
        <span className={`sw ${swatch}`} />
        <h2>{title}</h2>
        <span className="count">{entries.length}</span>
      </div>
      {entries.length ? (
        entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            people={people}
            flash={flashId === e.id}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
            onOpen={onOpen}
            onLongPress={onLongPress}
            onToggleType={onToggleType}
            typeToggleable={isTypeToggleable ? isTypeToggleable(e) : false}
          />
        ))
      ) : (
        emptyTitle && (
          <div className="empty">
            {emptyIcon}
            <b>{emptyTitle}</b>
            {emptySub}
          </div>
        )
      )}
    </div>
  );
}
