"use client";

import type { BoardEntry } from "@/lib/types";

// Consult rows (intent-router-handoff §4): tagged, answered back
// conversationally, never filed as a task — they live in their own Ask
// section at the top of the Board. Pending = Tier 2 still thinking (pulsing,
// not tappable); resolved = tap to open the conversation.
export default function AskSection({
  entries,
  onOpen,
  onDismiss,
}: {
  entries: BoardEntry[];
  onOpen: (entry: BoardEntry) => void;
  onDismiss: (entry: BoardEntry) => void;
}) {
  if (!entries.length) return null;
  return (
    <div className="section">
      <div className="section-h">
        <span className="sw ask" />
        <h2>Ask</h2>
        <span className="count">{entries.length}</span>
      </div>
      {entries.map((e) => {
        const pending = e.intentStatus === "processing";
        return (
          <div
            key={e.id}
            className={`ask-row${pending ? " pending" : ""}`}
            role={pending ? undefined : "button"}
            tabIndex={pending ? undefined : 0}
            onClick={pending ? undefined : () => onOpen(e)}
            onKeyDown={
              pending
                ? undefined
                : (ev) => {
                    if (ev.key === "Enter" || ev.key === " ") onOpen(e);
                  }
            }
          >
            <div className={`ask-icon${pending ? " pending" : ""}`}>
              {pending ? (
                <span className="pulse-dot" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </div>
            <div className="ask-body">
              <div className={`ask-label${pending ? " pending" : ""}`}>
                {pending ? "Still thinking it over…" : "You asked"}
              </div>
              <div className="ask-text">{e.text}</div>
            </div>
            {!pending && (
              <button
                type="button"
                className="ask-dismiss pressable"
                aria-label="Dismiss this question"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDismiss(e);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
