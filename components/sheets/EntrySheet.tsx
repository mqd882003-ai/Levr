"use client";

import { useEffect, useState } from "react";
import { SheetHead } from "@/components/sheets/Sheet";
import Avatar from "@/components/ui/Avatar";
import type { BoardEntry, Business, Person } from "@/lib/types";

export interface EntrySheetSave {
  summary: string;
  businessId: string | null;
  projectName: string;
  isLeverage: boolean | null;
  ownerId: string | null;
}

// Tap-to-expand + correct the classification (requirements §Interaction model
// step 4). Correction is never required — everything is prefilled.
export default function EntrySheet({
  entry,
  businesses,
  people,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  entry: BoardEntry;
  businesses: Business[];
  people: Person[];
  saving: boolean;
  onSave: (input: EntrySheetSave) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(entry.summary);
  const [businessId, setBusinessId] = useState(entry.businessId ?? "");
  const [projectName, setProjectName] = useState(entry.projectName ?? "");
  const [lev, setLev] = useState<boolean | null>(entry.isLeverage);
  const [ownerId, setOwnerId] = useState<string | null>(entry.ownerId);

  useEffect(() => {
    setSummary(entry.summary);
    setBusinessId(entry.businessId ?? "");
    setProjectName(entry.projectName ?? "");
    setLev(entry.isLeverage);
    setOwnerId(entry.ownerId);
  }, [entry]);

  const candidates = people.filter(
    (p) => !businessId || !p.business_id || p.business_id === businessId,
  );

  return (
    <>
      <SheetHead
        title="Fix it if I got it wrong"
        sub={new Date(entry.capturedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
        onClose={onClose}
      />
      <div className="expand-text">
        {entry.text}
        {entry.text !== entry.summary && (
          <small>Shown on board as: {entry.summary}</small>
        )}
      </div>
      <div className="field">
        <label htmlFor="x-summary">Summary</label>
        <input
          id="x-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="x-biz">Business</label>
          <div className="sel">
            <select
              id="x-biz"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
            >
              <option value="">None</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="x-project">Project</label>
          <input
            id="x-project"
            value={projectName}
            placeholder="Optional"
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Type</label>
        <div className="seg">
          <button
            type="button"
            className={`pressable${lev === true ? " on-signal" : ""}`}
            onClick={() => setLev(true)}
          >
            <span className="sw" />
            Your 20%
          </button>
          <button
            type="button"
            className={`pressable${lev === false ? " on-noise" : ""}`}
            onClick={() => setLev(false)}
          >
            <span className="sw" />
            Delegate
          </button>
        </div>
      </div>
      {lev === false && (
        <div className="field">
          <label>Owner</label>
          <div className="people-pick">
            {candidates.length ? (
              candidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pressable${ownerId === p.id ? " on" : ""}${
                    entry.suggestedPersonId === p.id && !ownerId ? " suggest" : ""
                  }`}
                  onClick={() => setOwnerId(ownerId === p.id ? null : p.id)}
                >
                  <Avatar id={p.id} name={p.name} />
                  {p.name}
                </button>
              ))
            ) : (
              <span>No one on Team yet.</span>
            )}
          </div>
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn-danger pressable"
          onClick={onDelete}
          disabled={saving}
          aria-label="Delete"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
        <button
          type="button"
          className="btn-primary pressable"
          disabled={saving}
          onClick={() =>
            onSave({
              summary: summary.trim() || entry.summary,
              businessId: businessId || null,
              projectName,
              isLeverage: lev,
              ownerId: lev === false ? ownerId : null,
            })
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
