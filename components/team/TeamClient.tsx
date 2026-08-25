"use client";

import { useCallback, useRef, useState } from "react";
import { deletePerson, savePerson, type PersonInput } from "@/app/team/actions";
import Sheet from "@/components/sheets/Sheet";
import PersonCard from "@/components/team/PersonCard";
import PersonForm from "@/components/team/PersonForm";
import PersonProfile from "@/components/team/PersonProfile";
import Toast, { type ToastState } from "@/components/ui/Toast";
import type { Business, Delegation, Person } from "@/lib/types";

export default function TeamClient({
  initialPeople,
  businesses,
  delegations,
  activeCounts,
  slackEnabled,
}: {
  initialPeople: Person[];
  businesses: Business[];
  delegations: Delegation[];
  activeCounts: Record<string, number>;
  slackEnabled: boolean;
}) {
  const [people, setPeople] = useState(initialPeople);
  // Sheet state machine: closed | profile of a person | form (edit person / add null)
  const [profile, setProfile] = useState<Person | null>(null);
  const [form, setForm] = useState<{ person: Person | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string, kind?: ToastState["kind"]) => {
    setToast({ msg, kind, key: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const businessName = (id: string | null) =>
    businesses.find((b) => b.id === id)?.name ?? null;

  const handleSave = async (input: PersonInput) => {
    const editingId = form?.person?.id ?? null;
    setSaving(true);
    const res = await savePerson(editingId, input);
    setSaving(false);
    if (!res.ok || !res.person) {
      showToast(res.error ?? "Save failed", "bad");
      return;
    }
    const saved = res.person;
    setPeople((prev) =>
      editingId ? prev.map((p) => (p.id === editingId ? saved : p)) : [...prev, saved],
    );
    setForm(null);
    if (editingId && profile?.id === editingId) setProfile(saved);
    showToast(editingId ? "Saved" : `${saved.name} added`, "good");
  };

  const handleDelete = async (person: Person) => {
    if (
      !window.confirm(
        "Remove this person? Their history stays on record but they will be unassigned from open items.",
      )
    )
      return;
    setSaving(true);
    const res = await deletePerson(person.id);
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Delete failed", "bad");
      return;
    }
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    setForm(null);
    setProfile(null);
    showToast("Removed");
  };

  const open = Boolean(profile || form);

  return (
    <section className="screen" aria-label="Team">
      <div className="topbar">
        <h1>Team</h1>
        <span className="meta">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </div>
      <div className="team">
        {people.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            businessName={businessName(p.business_id)}
            activeCount={activeCounts[p.id] ?? 0}
            onOpen={setProfile}
          />
        ))}
        <button
          type="button"
          className="add-person pressable"
          onClick={() => setForm({ person: null })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add someone to delegate to
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => {
          if (form) setForm(null);
          else setProfile(null);
        }}
      >
        {form ? (
          <PersonForm
            person={form.person}
            businesses={businesses}
            slackEnabled={slackEnabled}
            saving={saving}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setForm(null)}
          />
        ) : profile ? (
          <PersonProfile
            person={profile}
            businessName={businessName(profile.business_id)}
            history={delegations.filter((d) => d.person_id === profile.id)}
            onEdit={(p) => setForm({ person: p })}
            onClose={() => setProfile(null)}
          />
        ) : null}
      </Sheet>
      <Toast toast={toast} />
    </section>
  );
}
