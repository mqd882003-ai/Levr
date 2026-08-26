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
      <span className={`p-stat${activeCount ? "" : " zero"}`}>
        <b>{activeCount}</b>
        active
      </span>
    </button>
  );
}
