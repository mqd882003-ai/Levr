"use client";

import Avatar from "@/components/ui/Avatar";
import type { Person } from "@/lib/types";

export default function PersonCard({
  person,
  businessName,
  activeCount,
  onOpen,
}: {
  person: Person;
  businessName: string | null;
  activeCount: number;
  onOpen: (person: Person) => void;
}) {
  // Routing junction stage 4: capacity as standing state. No limit set →
  // the card is exactly what it was before this feature existed. With a
  // limit, the stat shows the true fraction — never clamped, so 6/5 reads
  // 6/5 in red; only the bar's fill width caps at 100%.
  const limit = person.capacity_limit;
  const over = limit !== null && activeCount >= limit; // same test as routing's capacity_full
  return (
    <button type="button" className="person pressable" onClick={() => onOpen(person)}>
      <Avatar id={person.id} name={person.name} />
      <span className="p-info">
        <span className="p-name">{person.name}</span>
        <span className="p-role">
          {[person.role, businessName].filter(Boolean).join(" · ") || "—"}
        </span>
        {!person.phone_number?.trim() && !person.email?.trim() && (
          <span className="p-role no-contact">No contact info yet</span>
        )}
      </span>
      <span className={`p-stat${activeCount ? "" : " zero"}${over ? " over" : ""}`}>
        <b>{limit !== null ? `${activeCount}/${limit}` : activeCount}</b>
        active
        {limit !== null && (
          <span className="cap-bar">
            <span
              className="cap-fill"
              style={{ width: `${Math.min(100, (activeCount / limit) * 100)}%` }}
            />
          </span>
        )}
      </span>
    </button>
  );
}
