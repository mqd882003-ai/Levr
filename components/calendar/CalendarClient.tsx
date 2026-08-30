"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  closeoutDelegation,
  createManualEntry,
  deleteEntry,
  parkEntry,
  saveEntry,
  toggleDone,
} from "@/app/board/actions";
import Sheet from "@/components/sheets/Sheet";
import CloseoutSheet, { type CloseoutTarget } from "@/components/sheets/CloseoutSheet";
import CreateEntrySheet, { type CreateEntrySave } from "@/components/sheets/CreateEntrySheet";
import DateAssignSheet from "@/components/sheets/DateAssignSheet";
import EntrySheet, { type EntrySheetSave } from "@/components/sheets/EntrySheet";
import Toast, { type ToastState } from "@/components/ui/Toast";
import type {
  BoardEntry,
  Business,
  Diagnosis,
  Outcome,
  Person,
  ProjectType,
  ProtectedWindow,
  TrustEvidence,
  Verdict,
} from "@/lib/types";

// Week view per reference/levr-combined-prototype.html. Three block kinds:
// - deadline (timed or all-day): entries placed on their parsed deadline_at day
// - protected (precise): windows with real clock times on known days
// - tentative: windows whose schedule the data can't actually pin down
//   (frequency like "4-5x/week", or no clock time) — shown floating across
//   days, styled distinctly, never omitted and never faked as precise.
// Entries whose deadline text couldn't parse to a date live in the undated
// strip up top — visible, just not pinned to a day the data doesn't support.
//
// calendar-phase1-handoff §1: tapping a deadline block opens the same
// EntrySheet Board uses — no parallel edit UI.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface DayWindow {
  window: ProtectedWindow;
  tentative: boolean;
}

function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(d.getTime() - d.getDay() * DAY_MS); // Sunday start
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Which weekdays (0-6) a window belongs to, and whether that placement is
// solid or a floating guess.
function expandWindow(w: ProtectedWindow): { days: number[]; tentative: boolean } {
  const freq = (w.frequency || "").toLowerCase();
  const named = WEEKDAY_NAMES.map((name, i) => (freq.includes(name.slice(0, -1)) ? i : -1)).filter(
    (i) => i >= 0,
  );
  const hasTime = Boolean(w.start && w.end);
  if (named.length) return { days: named, tentative: !hasTime };
  if (freq.includes("daily")) return { days: [0, 1, 2, 3, 4, 5, 6], tentative: !hasTime };
  // Imprecise ("4-5x/week" etc): the data doesn't say which days — float
  // across weekdays rather than pretending to know.
  return { days: [1, 2, 3, 4, 5], tentative: true };
}

function windowTime(w: ProtectedWindow): string {
  if (!w.start || !w.end) return "—";
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const hour12 = ((h + 11) % 12) + 1;
    return m ? `${hour12}:${String(m).padStart(2, "0")}` : String(hour12);
  };
  return `${fmt(w.start)}–${fmt(w.end)}`;
}

function deadlineTime(e: BoardEntry): string {
  if (e.deadlineAllDay || !e.deadlineAt) return "All day";
  return new Date(e.deadlineAt)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

export default function CalendarClient({
  entries: initialEntries,
  windows,
  businesses,
  businessProjectType,
  people,
  evidence,
}: {
  entries: BoardEntry[];
  windows: ProtectedWindow[];
  businesses: Business[];
  businessProjectType: Record<string, ProjectType>;
  people: Person[];
  evidence: TrustEvidence[];
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState(initialEntries);
  const [peopleList, setPeopleList] = useState(people);
  const [editing, setEditing] = useState<BoardEntry | null>(null);
  const [closeout, setCloseout] = useState<CloseoutTarget | null>(null);
  const [dating, setDating] = useState<BoardEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string, kind?: ToastState["kind"]) => {
    setToast({ msg, kind, key: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const patchEntry = (id: string, patch: Partial<BoardEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const today = new Date();
  const weekStart = new Date(startOfWeek(today).getTime() + weekOffset * 7 * DAY_MS);

  const undated = useMemo(() => entries.filter((e) => !e.deadlineAt), [entries]);
  const dated = useMemo(() => entries.filter((e) => e.deadlineAt), [entries]);

  const expandedWindows = useMemo(() => windows.map((w) => ({ w, exp: expandWindow(w) })), [windows]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * DAY_MS);
    const dayEntries = dated
      .filter((e) => sameDay(new Date(e.deadlineAt!), date))
      .sort((a, b) => {
        if (a.deadlineAllDay !== b.deadlineAllDay) return a.deadlineAllDay ? 1 : -1;
        return a.deadlineAt!.localeCompare(b.deadlineAt!);
      });
    const dayWindows: DayWindow[] = expandedWindows
      .filter(({ exp }) => exp.days.includes(date.getDay()))
      .map(({ w, exp }) => ({ window: w, tentative: exp.tentative }));
    return { date, dayEntries, dayWindows };
  });

  const weekLabel = weekStart.toLocaleDateString([], { month: "short", day: "numeric" });

  const handleToggleDone = async (entry: BoardEntry) => {
    patchEntry(entry.id, { done: true });
    const res = await toggleDone(entry.id, true);
    if (!res.ok) {
      patchEntry(entry.id, { done: false });
      showToast("Couldn't save that — try again", "bad");
      return;
    }
    if (res.closeout) setCloseout(res.closeout);
  };

  const handleSave = async (input: EntrySheetSave) => {
    if (!editing) return;
    setSaving(true);
    const res = await saveEntry({ id: editing.id, ...input });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Save failed", "bad");
      return;
    }
    patchEntry(editing.id, {
      summary: input.summary,
      businessId: input.businessId,
      businessName: businesses.find((b) => b.id === input.businessId)?.name ?? null,
      projectId: res.projectId ?? null,
      projectName: res.projectName ?? null,
      isLeverage: input.isLeverage,
      ownerId: res.ownerId ?? null,
      openDelegationId: res.openDelegationId ?? null,
      ...(res.suggestedPersonId !== undefined
        ? { suggestedPersonId: res.suggestedPersonId }
        : {}),
      ...(input.deadlineAt !== undefined ? { deadlineAt: input.deadlineAt } : {}),
    });
    setEditing(null);
    if (res.createdPerson) setPeopleList((prev) => [...prev, res.createdPerson!]);
    if (res.assignedName) {
      const n = res.notification;
      if (n?.sent) {
        showToast(`Sent to ${res.assignedName} via ${(n.channel ?? "").toUpperCase()}`, "good");
      } else if (n?.skipped === "no_contact") {
        showToast(`Assigned to ${res.assignedName} (no contact info yet)`, "good");
      } else if (n?.skipped === "notifications_off") {
        showToast(`Assigned to ${res.assignedName}`, "good");
      } else {
        showToast(`Assigned to ${res.assignedName} — message didn't send`, "bad");
      }
    } else showToast("Saved");
  };

  const handleAssignDate = async (deadlineAt: string) => {
    if (!dating) return;
    setSaving(true);
    const res = await saveEntry({
      id: dating.id,
      summary: dating.summary,
      businessId: dating.businessId,
      projectName: dating.projectName ?? "",
      isLeverage: dating.isLeverage,
      ownerId: dating.ownerId,
      deadlineAt,
    });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't set that date", "bad");
      return;
    }
    patchEntry(dating.id, { deadlineAt });
    setDating(null);
    showToast("Dated");
  };

  const handleCreate = async (input: CreateEntrySave) => {
    setSaving(true);
    const res = await createManualEntry(input);
    setSaving(false);
    if (!res.ok || !res.entry) {
      showToast(res.error ?? "Couldn't add that", "bad");
      return;
    }
    setEntries((prev) => [res.entry!, ...prev]);
    setCreating(false);
    if (res.createdPerson) setPeopleList((prev) => [...prev, res.createdPerson!]);
    if (res.assignedName) {
      const n = res.notification;
      if (n?.sent) {
        showToast(`Added and sent to ${res.assignedName} via ${(n.channel ?? "").toUpperCase()}`, "good");
      } else if (n?.skipped === "no_contact") {
        showToast(`Added and assigned to ${res.assignedName} (no contact info yet)`, "good");
      } else if (n?.skipped === "notifications_off") {
        showToast(`Added and assigned to ${res.assignedName}`, "good");
      } else {
        showToast(`Added and assigned to ${res.assignedName} — message didn't send`, "bad");
      }
    } else showToast("Added to calendar", "good");
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    const res = await deleteEntry(editing.id);
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Delete failed", "bad");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== editing.id));
    setEditing(null);
    showToast("Deleted");
  };

  const handlePark = async () => {
    if (!editing) return;
    const id = editing.id;
    const res = await parkEntry(id);
    if (!res.ok || !res.parkedUntil) {
      showToast(res.error ?? "Couldn't park that", "bad");
      return;
    }
    patchEntry(id, { parkedUntil: res.parkedUntil });
    setEditing(null);
    showToast("Parked — I'll bring it back in a couple weeks");
  };

  const handleCloseoutLog = async (
    outcome: Outcome,
    verdict: Verdict | null,
    note: string,
    diagnosis: Diagnosis | null,
  ) => {
    if (!closeout) return;
    setSaving(true);
    const res = await closeoutDelegation(closeout.delegationId, outcome, verdict, note, diagnosis);
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't log that", "bad");
      return;
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.openDelegationId === closeout.delegationId ? { ...e, openDelegationId: null } : e,
      ),
    );
    setCloseout(null);
    showToast("Logged to their history", "good");
  };

  return (
    <section className="screen" aria-label="Calendar">
      <div className="topbar">
        <h1>Calendar</h1>
        <div className="day-nav">
          <button
            type="button"
            className="day-arrow pressable"
            aria-label="Previous week"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="day-arrow pressable"
            aria-label="Next week"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Calendar view">
        {/* Day view is v1-stubbed by design — the pill exists so the layout
            matches the approved mockup, but only Week is real. */}
        <span className="toggle-pill disabled" aria-disabled="true" title="Coming later">
          Day
        </span>
        <span className="toggle-pill active" role="tab" aria-selected="true">
          Week
        </span>
        {weekOffset !== 0 && (
          <button type="button" className="toggle-pill today-jump" onClick={() => setWeekOffset(0)}>
            Today ({weekLabel})
          </button>
        )}
      </div>

      {undated.length > 0 && (
        <div className="undated-strip">
          <div className="undated-label">No date yet — still real deadlines</div>
          {undated.map((e) => (
            <button
              key={e.id}
              type="button"
              className="mini-block undated pressable"
              onClick={() => setDating(e)}
            >
              <span className="mini-time">?</span>
              <span className="mini-label">
                {e.summary}
                <span className="undated-raw">&ldquo;{e.explicitDeadline}&rdquo;</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="week-view">
        {days.map(({ date, dayEntries, dayWindows }) => {
          const isToday = sameDay(date, today);
          return (
            <div className="week-day-section" key={date.toISOString()}>
              <div className={`week-day-header${isToday ? " today" : ""}`}>
                <span className="dow">{date.toLocaleDateString([], { weekday: "long" })}</span>
                <span className="date">
                  {date.toLocaleDateString([], { month: "short", day: "numeric" })}
                  {isToday ? " · Today" : ""}
                </span>
                {dayEntries.length > 0 && (
                  <span className="count">
                    {dayEntries.length} deadline{dayEntries.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {dayEntries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="mini-block deadline pressable"
                  onClick={() => setEditing(e)}
                >
                  <span className="mini-time">{deadlineTime(e)}</span>
                  <span className="mini-label">
                    {e.summary}
                    {e.businessId && e.businessName && (
                      <span className="mini-biz">{e.businessName}</span>
                    )}
                  </span>
                </button>
              ))}
              {dayWindows.map(({ window: w, tentative }, i) => (
                <div
                  key={w.label + i}
                  className={`mini-block protected${tentative ? " tentative" : ""}`}
                >
                  <span className="mini-time">{windowTime(w)}</span>
                  <span className="mini-label">
                    {w.label}
                    {tentative && <span className="floats-tag">floats</span>}
                  </span>
                </div>
              ))}
              {dayEntries.length === 0 && dayWindows.length === 0 && (
                <div className="week-empty">Nothing scheduled</div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="fab pressable"
        aria-label="Add to calendar"
        onClick={() => setCreating(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Sheet
        open={Boolean(editing || closeout || dating || creating)}
        onClose={() => {
          if (closeout) setCloseout(null);
          else if (dating) setDating(null);
          else if (creating) setCreating(false);
          else setEditing(null);
        }}
      >
        {closeout ? (
          <CloseoutSheet target={closeout} saving={saving} onLog={handleCloseoutLog} onSkip={() => setCloseout(null)} />
        ) : dating ? (
          <DateAssignSheet
            target={dating}
            saving={saving}
            onAssign={handleAssignDate}
            onSkip={() => setDating(null)}
          />
        ) : creating ? (
          <CreateEntrySheet
            businesses={businesses}
            people={peopleList}
            saving={saving}
            onSave={handleCreate}
            onClose={() => setCreating(false)}
          />
        ) : editing ? (
          <EntrySheet
            entry={editing}
            businesses={businesses}
            businessProjectType={businessProjectType}
            people={peopleList}
            evidence={evidence}
            saving={saving}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditing(null)}
            onPark={() => void handlePark()}
            onChecklistChanged={(entryId, checklist) => patchEntry(entryId, { checklist })}
            onMentionedPeopleChanged={(entryId, mentionedPeople) => patchEntry(entryId, { mentionedPeople })}
            onPersonAdded={(person) => setPeopleList((prev) => [...prev, person])}
            onMarkDone={() => {
              const target = editing;
              setEditing(null);
              void handleToggleDone(target);
            }}
          />
        ) : null}
      </Sheet>
      <Toast toast={toast} />
    </section>
  );
}
