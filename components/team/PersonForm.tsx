"use client";

import { useEffect, useState } from "react";
import { SheetHead } from "@/components/sheets/Sheet";
import type { PersonInput } from "@/app/team/actions";
import type { Business, Channel, Person } from "@/lib/types";

export default function PersonForm({
  person,
  businesses,
  slackEnabled,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  person: Person | null; // null = add
  businesses: Business[];
  slackEnabled: boolean;
  saving: boolean;
  onSave: (input: PersonInput) => void;
  onDelete: (person: Person) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [businessId, setBusinessId] = useState(person?.business_id ?? "");
  const [phone, setPhone] = useState(person?.phone_number ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [channel, setChannel] = useState<Channel>(person?.preferred_channel ?? "sms");
  const [notes, setNotes] = useState(person?.capability_notes ?? "");
  // Routing junction stage 4: null = no limit (the default — adding someone
  // never silently caps them). Stepper, not a number input: values are tiny,
  // no mobile keyboard over the sheet, and "No limit" is a first-class
  // endpoint below 1 instead of an awkward empty string.
  const [capacity, setCapacity] = useState<number | null>(person?.capacity_limit ?? null);

  useEffect(() => {
    setName(person?.name ?? "");
    setRole(person?.role ?? "");
    setBusinessId(person?.business_id ?? "");
    setPhone(person?.phone_number ?? "");
    setEmail(person?.email ?? "");
    setChannel(person?.preferred_channel ?? "sms");
    setNotes(person?.capability_notes ?? "");
    setCapacity(person?.capacity_limit ?? null);
  }, [person]);

  const CAP_START = 5; // first + from "No limit" lands here
  const CAP_MAX = 20;
  const stepCapacity = (dir: 1 | -1) => {
    setCapacity((c) => {
      if (dir === 1) return c === null ? CAP_START : Math.min(CAP_MAX, c + 1);
      return c === null || c <= 1 ? null : c - 1;
    });
  };

  // Slack is only offered as a channel when it's connected in Settings
  // (requirements §Communication channels).
  const channels: Array<[Channel, string]> = [
    ["sms", "SMS"],
    ["email", "Email"],
    ...(slackEnabled || person?.preferred_channel === "slack"
      ? ([["slack", "Slack"]] as Array<[Channel, string]>)
      : []),
  ];

  return (
    <>
      <SheetHead
        title={person ? "Edit person" : "Add someone"}
        sub={person ? undefined : "Name and a phone number is enough."}
        onClose={onClose}
      />
      <div className="field">
        <label htmlFor="p-name">Name</label>
        <input
          id="p-name"
          value={name}
          placeholder="Full name"
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="p-role">Role</label>
          <input
            id="p-role"
            value={role}
            placeholder="VA, Realtor…"
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-biz">Business</label>
          <div className="sel">
            <select
              id="p-biz"
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
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="p-phone">Phone</label>
          <input
            id="p-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            placeholder="+1 555 000 0000"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-email">Email</label>
          <input
            id="p-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="Optional"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Preferred channel</label>
        <div className="seg">
          {channels.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`pressable${channel === value ? " on-signal" : ""}`}
              onClick={() => setChannel(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Capacity</label>
        <div className="stepper">
          <button
            type="button"
            className="pressable"
            aria-label="Lower capacity"
            disabled={capacity === null}
            onClick={() => stepCapacity(-1)}
          >
            −
          </button>
          <span className="stepper-value">
            {capacity === null ? "No limit" : `${capacity} open task${capacity === 1 ? "" : "s"} max`}
          </span>
          <button
            type="button"
            className="pressable"
            aria-label="Raise capacity"
            disabled={capacity === CAP_MAX}
            onClick={() => stepCapacity(1)}
          >
            +
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="p-notes">Capability notes</label>
        <textarea
          id="p-notes"
          value={notes}
          placeholder="e.g. strong on cold calls, weak on follow-up"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="actions">
        {person && (
          <button
            type="button"
            className="btn-danger pressable"
            onClick={() => onDelete(person)}
            disabled={saving}
            aria-label="Delete"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="btn-primary pressable"
          disabled={saving}
          onClick={() =>
            onSave({
              name,
              role,
              businessId: businessId || null,
              phone,
              email,
              channel,
              notes,
              capacityLimit: capacity,
            })
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
