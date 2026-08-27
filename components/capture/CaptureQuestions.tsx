"use client";

import { useState } from "react";
import { addMentionedPerson, setEntryBusiness } from "@/app/board/actions";

// One askable item from the just-classified capture (requirements
// §Interaction model rule-3 exception). Entries are already saved before any
// question renders — answering only fills blanks in.
export type AskableItem =
  | { kind: "person"; entryId: string; name: string; businessId: string | null }
  | { kind: "business"; entryId: string; summary: string };

// One question at a time, tap to answer, every question skippable. Skipped or
// failed answers keep their unresolved state and surface through the existing
// needs-a-look / Review-with-me path — never re-asked, never blocking.
export default function CaptureQuestions({
  queue,
  businesses,
  onDone,
}: {
  queue: AskableItem[];
  businesses: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const item = queue[index];
  if (!item) return null;

  const advance = () => {
    setBusy(false);
    if (index + 1 >= queue.length) onDone();
    else setIndex(index + 1);
  };

  const answerBusiness = async (entryId: string, businessId: string) => {
    if (busy) return;
    setBusy(true);
    // Errors fall through silently: the entry just stays unresolved, exactly
    // like a Skip, and the needs-review path picks it up.
    await setEntryBusiness(entryId, businessId).catch(() => undefined);
    advance();
  };

  const answerPerson = async (entryId: string, name: string, businessId: string | null) => {
    if (busy) return;
    setBusy(true);
    await addMentionedPerson(entryId, name, businessId).catch(() => undefined);
    advance();
  };

  return (
    <div className="capture-q" role="group" aria-label="Quick question">
      <div className="capture-q-count">
        {index + 1} of {queue.length}
      </div>
      {item.kind === "person" ? (
        <>
          <p className="capture-q-text">
            You mentioned <strong>{item.name}</strong> — add them to Team?
          </p>
          <div className="capture-q-chips">
            <button
              type="button"
              className="chip pressable capture-q-primary"
              disabled={busy}
              onClick={() => void answerPerson(item.entryId, item.name, item.businessId)}
            >
              Add
            </button>
            <button type="button" className="chip pressable" disabled={busy} onClick={advance}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="capture-q-text">
            Which business is &ldquo;{item.summary}&rdquo; for?
          </p>
          <div className="capture-q-chips">
            {businesses.map((b) => (
              <button
                key={b.id}
                type="button"
                className="chip pressable"
                disabled={busy}
                onClick={() => void answerBusiness(item.entryId, b.id)}
              >
                {b.name}
              </button>
            ))}
            <button type="button" className="chip pressable capture-q-skip" disabled={busy} onClick={advance}>
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
