"use client";

import { useState } from "react";
import { SheetHead } from "@/components/sheets/Sheet";
import { combineLocal, toDateInput, toTimeInput } from "@/lib/dateInput";

export interface DateAssignTarget {
  id: string;
  summary: string;
  explicitDeadline: string | null;
}

// Calendar phase 1 §3: the undated strip's own small sheet — sets deadline_at
// on an item the deadline parser couldn't pin to a date. Not EntrySheet: no
// classification fields, just enough to give it a day/time.
export default function DateAssignSheet({
  target,
  saving,
  onAssign,
  onSkip,
}: {
  target: DateAssignTarget;
  saving: boolean;
  onAssign: (deadlineAt: string) => void;
  onSkip: () => void;
}) {
  const now = new Date().toISOString();
  const [date, setDate] = useState(toDateInput(now));
  const [time, setTime] = useState(toTimeInput(now));

  return (
    <>
      <SheetHead title="Set a date" onClose={onSkip} />
      <div className="field">
        <label htmlFor="x-summary">What it is</label>
        <input id="x-summary" value={target.summary} disabled />
      </div>
      <div className="field">
        <label htmlFor="x-raw">Originally said</label>
        <input id="x-raw" value={target.explicitDeadline ?? ""} disabled />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="x-date">Date</label>
          <input id="x-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="x-time">Time</label>
          <input id="x-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn-ghost pressable" onClick={onSkip} disabled={saving}>
          Leave undated
        </button>
        <button
          type="button"
          className="btn-primary pressable"
          disabled={saving}
          onClick={() => {
            const iso = combineLocal(date, time);
            if (iso) onAssign(iso);
          }}
        >
          {saving ? "Saving…" : "Set date"}
        </button>
      </div>
    </>
  );
}
