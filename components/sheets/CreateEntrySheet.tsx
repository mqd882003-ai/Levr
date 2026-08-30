"use client";

import { useState } from "react";
import { SheetHead } from "@/components/sheets/Sheet";
import Avatar from "@/components/ui/Avatar";
import { avatarTint, initials } from "@/lib/avatar";
import { combineLocal, toDateInput, toTimeInput } from "@/lib/dateInput";
import type { Business, Person } from "@/lib/types";

export interface CreateEntrySave {
  summary: string;
  businessId: string | null;
  isLeverage: boolean;
  ownerId: string | null;
  newOwnerName?: string;
  deadlineAt: string;
}

// Calendar phase 2 §2: the "+" button's manual-create sheet. Plain insert,
// no AI classification — always requires date+time (no "leave undated" path
// for manual creates, unlike the parsed-from-text undated strip).
export default function CreateEntrySheet({
  businesses,
  people,
  defaultDate,
  saving,
  onSave,
  onClose,
}: {
  businesses: Business[];
  people: Person[];
  defaultDate?: Date;
  saving: boolean;
  onSave: (input: CreateEntrySave) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [isLeverage, setIsLeverage] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [newOwnerName, setNewOwnerName] = useState<string | null>(null);
  const base = defaultDate ?? new Date();
  const [date, setDate] = useState(toDateInput(base.toISOString()));
  const [time, setTime] = useState(toTimeInput(base.toISOString()));

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

  return (
    <>
      <SheetHead title="Add to calendar" sub="Manual add — no AI classification" onClose={onClose} />
      <div className="field">
        <label htmlFor="c-summary">What it is</label>
        <input
          id="c-summary"
          value={summary}
          placeholder="e.g. Call the vendor"
          onChange={(e) => setSummary(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="c-biz">Business</label>
        <div className="sel">
          <select id="c-biz" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
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
        <label>Type</label>
        <div className="seg">
          <button
            type="button"
            className={`pressable${isLeverage ? " on-signal" : ""}`}
            onClick={() => setIsLeverage(true)}
          >
            <span className="sw" />
            Your 20%
          </button>
          <button
            type="button"
            className={`pressable${!isLeverage ? " on-noise" : ""}`}
            onClick={() => setIsLeverage(false)}
          >
            <span className="sw" />
            Delegate
          </button>
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="c-date">Date</label>
          <input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c-time">Time</label>
          <input id="c-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {!isLeverage && (
        <div className="field">
          <label>Hand off to</label>
          <div className="people-pick">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pressable${ownerId === p.id ? " on" : ""}`}
                onClick={() => setOwnerId(ownerId === p.id ? null : p.id)}
              >
                <Avatar id={p.id} name={p.name} />
                {p.name}
              </button>
            ))}
            {newOwnerName && (
              <button type="button" className="pressable on" onClick={() => setNewOwnerName(null)}>
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
              placeholder={people.length ? "Someone else? Type a name" : "Type a name to hand off to"}
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
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn-primary pressable"
          disabled={saving || !summary.trim()}
          onClick={() => {
            const iso = combineLocal(date, time);
            if (!iso) return;
            onSave({
              summary: summary.trim(),
              businessId: businessId || null,
              isLeverage,
              ownerId: isLeverage ? null : ownerId,
              newOwnerName: isLeverage ? undefined : (newOwnerName ?? undefined),
              deadlineAt: iso,
            });
          }}
        >
          {saving ? "Adding…" : "Add to calendar"}
        </button>
      </div>
    </>
  );
}
