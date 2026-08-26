"use client";

import { useEffect, useState } from "react";
import { SheetHead } from "@/components/sheets/Sheet";
import type { Diagnosis, Outcome, Verdict } from "@/lib/types";

export interface CloseoutTarget {
  delegationId: string;
  personName: string;
  taskText: string;
}

const OUTCOMES: Array<[Outcome, string, string]> = [
  ["done", "Done", "on-good"],
  ["late", "Done, late", "on-warn"],
  ["not_done", "Not done", "on-bad"],
];
const VERDICTS: Array<[Verdict, string, string]> = [
  ["fully_trust", "Fully trust", "on-good"],
  ["needs_coaching", "Needs coaching", "on-warn"],
  ["pull_back", "Pull back", "on-bad"],
];
// A4: diagnosis chips, split by who owns the fix. Only not_ready and
// no_follow_through feed the person's trust evidence — the rest close the
// loop without touching their track record.
const DIAGNOSES: Array<[Diagnosis, string]> = [
  ["unclear_brief", "Wasn't clear what I needed"],
  ["not_ready", "Not the right fit for this yet"],
  ["bandwidth", "Got buried / bandwidth"],
  ["blocked", "Waiting on me or someone else"],
  ["no_follow_through", "Just didn't follow through"],
];

// "How did it go?" — quick, not a form (requirements §Interaction model
// step 6). This is what populates the person's delegation history.
export default function CloseoutSheet({
  target,
  saving,
  onLog,
  onSkip,
}: {
  target: CloseoutTarget;
  saving: boolean;
  onLog: (outcome: Outcome, verdict: Verdict | null, note: string, diagnosis: Diagnosis | null) => void;
  onSkip: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>("done");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
    setOutcome("done");
    setVerdict(null);
    setNote("");
    setDiagnosis(null);
  }, [target.delegationId]);

  return (
    <>
      <SheetHead
        title="How did it go?"
        sub={`${target.personName} · ${target.taskText}`}
        onClose={onSkip}
      />
      <div className="field">
        <label>Outcome</label>
        <div className="seg">
          {OUTCOMES.map(([value, label, cls]) => (
            <button
              key={value}
              type="button"
              className={`pressable${outcome === value ? ` ${cls}` : ""}`}
              onClick={() => setOutcome(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Verdict</label>
        <div className="seg">
          {VERDICTS.map(([value, label, cls]) => (
            <button
              key={value}
              type="button"
              className={`pressable${verdict === value ? ` ${cls}` : ""}`}
              onClick={() => setVerdict(verdict === value ? null : value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {outcome !== "done" && (
        <div className="field">
          <label>What got in the way? (optional)</label>
          <div className="diag-chips">
            {DIAGNOSES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`pressable${diagnosis === value ? " on" : ""}`}
                onClick={() => setDiagnosis(diagnosis === value ? null : value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="x-note">One-liner (optional)</label>
        <input
          id="x-note"
          value={note}
          placeholder="e.g. nailed it, but needed two reminders"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="actions">
        <button type="button" className="btn-ghost pressable" onClick={onSkip} disabled={saving}>
          Skip
        </button>
        <button
          type="button"
          className="btn-primary pressable"
          disabled={saving}
          onClick={() => onLog(outcome, verdict, note, outcome === "done" ? null : diagnosis)}
        >
          {saving ? "Logging…" : "Log it"}
        </button>
      </div>
    </>
  );
}
