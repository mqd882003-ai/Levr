"use client";

import { useEffect, useState } from "react";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/app/board/actions";
import { SheetHead } from "@/components/sheets/Sheet";
import Avatar from "@/components/ui/Avatar";
import { avatarTint, initials } from "@/lib/avatar";
import { readTrust } from "@/lib/trust";
import type { BoardEntry, Business, Person, TrustEvidence } from "@/lib/types";

type ChecklistState = BoardEntry["checklist"];

export interface EntrySheetSave {
  summary: string;
  businessId: string | null;
  projectName: string;
  isLeverage: boolean | null;
  ownerId: string | null;
  newOwnerName?: string; // A1: inline-create + assign
  confirmFirst: boolean; // A5
  flagShown: string | null; // A3.6: trust flag visible at assignment
}

// Tap-to-expand + correct the classification (requirements §Interaction model
// step 4). Correction is never required — everything is prefilled.
export default function EntrySheet({
  entry,
  businesses,
  people,
  evidence,
  saving,
  onSave,
  onDelete,
  onClose,
  onPark,
  onChecklistChanged,
}: {
  entry: BoardEntry;
  businesses: Business[];
  people: Person[];
  evidence: TrustEvidence[];
  saving: boolean;
  onSave: (input: EntrySheetSave) => void;
  onDelete: () => void;
  onClose: () => void;
  onPark: () => void;
  onChecklistChanged: (entryId: string, checklist: ChecklistState) => void;
}) {
  const [summary, setSummary] = useState(entry.summary);
  const [businessId, setBusinessId] = useState(entry.businessId ?? "");
  const [projectName, setProjectName] = useState(entry.projectName ?? "");
  const [lev, setLev] = useState<boolean | null>(entry.isLeverage);
  const [ownerId, setOwnerId] = useState<string | null>(entry.ownerId);
  const [checklist, setChecklist] = useState<ChecklistState>(entry.checklist);
  const [newStep, setNewStep] = useState("");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [newOwnerName, setNewOwnerName] = useState<string | null>(null);
  const [confirmFirst, setConfirmFirst] = useState(false);

  useEffect(() => {
    setSummary(entry.summary);
    setBusinessId(entry.businessId ?? "");
    setProjectName(entry.projectName ?? "");
    setLev(entry.isLeverage);
    setOwnerId(entry.ownerId);
    setChecklist(entry.checklist);
    setNewStep("");
    setOwnerQuery("");
    setNewOwnerName(null);
    setConfirmFirst(false);
  }, [entry]);

  const patchChecklist = (next: ChecklistState) => {
    setChecklist(next);
    onChecklistChanged(entry.id, next);
  };
  const handleStepToggle = (id: string) => {
    const next = checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
    const item = next.find((c) => c.id === id);
    patchChecklist(next);
    if (item) void toggleChecklistItem(id, item.done);
  };
  const handleStepRemove = (id: string) => {
    patchChecklist(checklist.filter((c) => c.id !== id));
    void deleteChecklistItem(id);
  };
  const handleStepAdd = async () => {
    const text = newStep.trim();
    if (!text) return;
    setNewStep("");
    const res = await addChecklistItem(entry.id, text);
    if (res.ok && res.item) {
      patchChecklist([...checklist, { id: res.item.id, text: res.item.text, done: false }]);
    }
  };

  // Everyone is offerable (cross-business handoffs are real); people from the
  // entry's business just list first.
  const candidates = [...people].sort((a, b) => {
    const rank = (p: Person) =>
      businessId && p.business_id === businessId ? 0 : p.business_id ? 2 : 1;
    return rank(a) - rank(b);
  });

  // A1: hand off to a typed name. If it fuzzy-matches someone, select them;
  // otherwise stage an inline create-and-assign.
  const handleAddByName = () => {
    const name = ownerQuery.trim();
    if (!name) return;
    const match = people.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().startsWith(name.toLowerCase()),
    );
    if (match) {
      setOwnerId(match.id);
      setNewOwnerName(null);
    } else {
      setNewOwnerName(name);
      setOwnerId(null);
    }
    setOwnerQuery("");
  };

  // A3.5: per-category read for the selected person, at the moment of handoff.
  const trust =
    lev === false && ownerId && entry.category
      ? readTrust(evidence, ownerId, entry.category)
      : null;
  const flagShown = trust?.state === "flag" ? (trust.line ?? null) : null;

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
      {entry.tier2Status === "flagged" && entry.tier2Reason && (
        <div className="reclass-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            On second look: {entry.tier2Reason} Change the type below if you agree — any
            save clears this.
          </span>
        </div>
      )}
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
          <label>Hand off to</label>
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
            ) : null}
            {newOwnerName && (
              <button
                type="button"
                className="pressable on"
                onClick={() => setNewOwnerName(null)}
              >
                <span className="avatar" style={{ background: avatarTint(newOwnerName) }}>
                  {initials(newOwnerName)}
                </span>
                {newOwnerName}
              </button>
            )}
          </div>
          {newOwnerName && (
            <div className="new-owner-note">
              {newOwnerName} isn&apos;t in your Team yet &mdash; saving adds them and hands this
              off. Contact info can come later.
            </div>
          )}
          <div className="check-add" style={{ marginTop: 10 }}>
            <input
              value={ownerQuery}
              placeholder={candidates.length ? "Someone else? Type a name" : "Type a name to hand off to"}
              onChange={(e) => setOwnerQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddByName();
                }
              }}
            />
            <button type="button" className="pressable" onClick={handleAddByName}>
              Add
            </button>
          </div>
          {trust?.line && (
            <div className={"trust-line" + (trust.state === "flag" ? " flag" : "")}>
              {trust.line}
            </div>
          )}
          {(ownerId || newOwnerName) && (
            <div className="confirm-first-row">
              <span>
                Confirm with me first
                <small>Off = decide and go. On = the message tells them to check with you before starting.</small>
              </span>
              <button
                type="button"
                className={"switch" + (confirmFirst ? " on" : "")}
                role="switch"
                aria-checked={confirmFirst}
                aria-label="Confirm with me first"
                onClick={() => setConfirmFirst((v) => !v)}
              />
            </div>
          )}
        </div>
      )}
      {lev === false && (
        <div className="field">
          <label>Steps</label>
          {checklist.map((item) => (
            <div key={item.id} className={`check-item${item.done ? " done" : ""}`}>
              <button
                type="button"
                className="cb"
                onClick={() => handleStepToggle(item.id)}
                aria-label={item.done ? "Mark step not done" : "Mark step done"}
              >
                <span className="box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </button>
              <span className="txt">{item.text}</span>
              <button
                type="button"
                className="rm pressable"
                onClick={() => handleStepRemove(item.id)}
                aria-label="Remove step"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="check-add">
            <input
              value={newStep}
              placeholder={checklist.length ? "Add a step" : "Break it into steps"}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleStepAdd();
                }
              }}
            />
            <button type="button" className="pressable" onClick={() => void handleStepAdd()}>
              Add
            </button>
          </div>
        </div>
      )}
      <div className="actions">
        {!entry.done && (
          <button
            type="button"
            className="btn-ghost pressable"
            style={{ flex: "0 0 auto", padding: "0 16px" }}
            onClick={onPark}
            disabled={saving}
          >
            Not now
          </button>
        )}
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
              newOwnerName:
                lev === false && !ownerId && newOwnerName ? newOwnerName : undefined,
              confirmFirst,
              flagShown,
            })
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
