"use client";

import HistoryTimeline from "@/components/team/HistoryTimeline";
import Avatar from "@/components/ui/Avatar";
import type { Delegation, Person } from "@/lib/types";

// Full person profile (requirements §Team): quick actions are plain tel:/sms:
// links — identical iOS/Android behavior, no permissions, no contacts API.
export default function PersonProfile({
  person,
  businessName,
  history,
  onEdit,
  onClose,
}: {
  person: Person;
  businessName: string | null;
  history: Delegation[];
  onEdit: (person: Person) => void;
  onClose: () => void;
}) {
  const tel = person.phone_number ? person.phone_number.replace(/[^\d+]/g, "") : "";
  return (
    <>
      <div className="profile-head">
        <Avatar id={person.id} name={person.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sheet-title">{person.name}</div>
          <div className="sheet-sub">
            {[person.role, businessName].filter(Boolean).join(" · ") || "No role set"}
          </div>
        </div>
        <button
          type="button"
          className="close-btn pressable"
          style={{ width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 600 }}
          onClick={() => onEdit(person)}
        >
          Edit
        </button>
        <button
          type="button"
          className="close-btn pressable"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="link-row">
        <a href={`tel:${tel}`} className={tel ? "" : "off"} aria-disabled={!tel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z" />
          </svg>
          Call
        </a>
        <a href={`sms:${tel}`} className={`secondary${tel ? "" : " off"}`} aria-disabled={!tel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Text
        </a>
      </div>
      {!tel && (
        <div className="sheet-sub" style={{ marginTop: -12, marginBottom: 16 }}>
          Add a phone number to enable Call and Text.
        </div>
      )}
      <div className="sheet-sub">
        Prefers <b>{person.preferred_channel.toUpperCase()}</b>
        {person.email ? ` · ${person.email}` : ""}
      </div>

      <div className="subhead">Capability notes</div>
      <div
        className="expand-text"
        style={person.capability_notes ? undefined : { color: "var(--dim)" }}
      >
        {person.capability_notes || "Nothing noted yet. Tap Edit to add observations."}
      </div>

      <div className="subhead">
        Delegation history
        <small>
          {history.length} task{history.length === 1 ? "" : "s"}
        </small>
      </div>
      <HistoryTimeline items={history} />
    </>
  );
}
