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
//
// Day view (calendar-phase2-item3): DELIBERATE choice, not accidental —
// windows and deadlines are merged and sorted chronologically together
// (matching the original day-agenda concept this app is modeled from), unlike
// Week's per-day list which still lists deadlines before windows unsorted.
// An agenda view's whole point is "what happens when" as one linear flow;
// Week's ordering was never a considered decision, just how it fell out of
// rendering entries then windows. Untimed windows and all-day deadlines sort
// to the end of the day (no real clock position), consistent with Week's
// existing all-day-last convention for deadlines specifically.

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

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function dayEntriesFor(date: Date, dated: BoardEntry[]): BoardEntry[] {
  return dated
    .filter((e) => sameDay(new Date(e.deadlineAt!), date))
    .sort((a, b) => {
      if (a.deadlineAllDay !== b.deadlineAllDay) return a.deadlineAllDay ? 1 : -1;
      return a.deadlineAt!.localeCompare(b.deadlineAt!);
    });
}

function dayWindowsFor(
  date: Date,
  expandedWindows: { w: ProtectedWindow; exp: { days: number[]; tentative: boolean } }[],
): DayWindow[] {
  return expandedWindows
    .filter(({ exp }) => exp.days.includes(date.getDay()))
    .map(({ w, exp }) => ({ window: w, tentative: exp.tentative }));
}

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Day view's chronological merge (see header comment for why this differs
// from Week). Untimed windows and all-day deadlines sort to the end.
type DayBlock =
  | { kind: "deadline"; entry: BoardEntry; sortKey: number }
  | { kind: "protected"; window: ProtectedWindow; tentative: boolean; sortKey: number };

function buildDayBlocks(dayEntries: BoardEntry[], dayWindows: DayWindow[]): DayBlock[] {
  const blocks: DayBlock[] = [];
  for (const e of dayEntries) {
    const sortKey =
      e.deadlineAllDay || !e.deadlineAt
        ? Infinity
        : new Date(e.deadlineAt).getHours() * 60 + new Date(e.deadlineAt).getMinutes();
    blocks.push({ kind: "deadline", entry: e, sortKey });
  }
  for (const { window: w, tentative } of dayWindows) {
    blocks.push({ kind: "protected", window: w, tentative, sortKey: w.start ? hhmmToMinutes(w.start) : Infinity });
  }
  return blocks.sort((a, b) => a.sortKey - b.sortKey);
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
  const [view, setView] = useState<"week" | "day" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayCursor, setDayCursor] = useState(() => new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
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
    return {
      date,
      dayEntries: dayEntriesFor(date, dated),
      dayWindows: dayWindowsFor(date, expandedWindows),
    };
  });

  const weekLabel = weekStart.toLocaleDateString([], { month: "short", day: "numeric" });

  const cursorEntries = useMemo(() => dayEntriesFor(dayCursor, dated), [dayCursor, dated]);
  const cursorWindows = useMemo(
    () => dayWindowsFor(dayCursor, expandedWindows),
    [dayCursor, expandedWindows],
  );
  const dayBlocks = useMemo(
    () => buildDayBlocks(cursorEntries, cursorWindows),
    [cursorEntries, cursorWindows],
  );

  // Month view (calendar-phase2-item4): dot counts come from the same
  // `dated` array Week/Day already compute — one source of truth, no
  // separate fetch or count query.
  const deadlineCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of dated) {
      const key = dateKey(new Date(e.deadlineAt!));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [dated]);
  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth.getTime() - firstOfMonth.getDay() * DAY_MS);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart.getTime() + i * DAY_MS);
      return {
        date,
        inMonth: date.getMonth() === monthCursor.getMonth(),
        count: deadlineCountByDate.get(dateKey(date)) ?? 0,
      };
    });
  }, [monthCursor, deadlineCountByDate]);
  const monthLabel = monthCursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const isCurrentMonth =
    monthCursor.getFullYear() === today.getFullYear() && monthCursor.getMonth() === today.getMonth();

  // Per-view navigation semantics — each view's prev/next arrow means
  // something different (a day, a week, a month), not one shared step.
  const navigate = (dir: 1 | -1) => {
    if (view === "day") setDayCursor((d) => new Date(d.getTime() + dir * DAY_MS));
    else if (view === "month") setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setWeekOffset((o) => o + dir);
  };

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
            aria-label={view === "day" ? "Previous day" : view === "month" ? "Previous month" : "Previous week"}
            onClick={() => navigate(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="day-arrow pressable"
            aria-label={view === "day" ? "Next day" : view === "month" ? "Next month" : "Next week"}
            onClick={() => navigate(1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Calendar view">
        <button
          type="button"
          className={`toggle-pill${view === "day" ? " active" : ""}`}
          role="tab"
          aria-selected={view === "day"}
          onClick={() => setView("day")}
        >
          Day
        </button>
        <button
          type="button"
          className={`toggle-pill${view === "week" ? " active" : ""}`}
          role="tab"
          aria-selected={view === "week"}
          onClick={() => setView("week")}
        >
          Week
        </button>
        <button
          type="button"
          className={`toggle-pill${view === "month" ? " active" : ""}`}
          role="tab"
          aria-selected={view === "month"}
          onClick={() => setView("month")}
        >
          Month
        </button>
        {view === "week" && weekOffset !== 0 && (
          <button type="button" className="toggle-pill today-jump" onClick={() => setWeekOffset(0)}>
            Today ({weekLabel})
          </button>
        )}
        {view === "day" && !sameDay(dayCursor, today) && (
          <button type="button" className="toggle-pill today-jump" onClick={() => setDayCursor(new Date())}>
            Today
          </button>
        )}
        {view === "month" && !isCurrentMonth && (
          <button
            type="button"
            className="toggle-pill today-jump"
            onClick={() => setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
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

      {view === "day" && (
        <>
          <div className={`day-only-title${sameDay(dayCursor, today) ? " today" : ""}`}>
            {dayCursor.toLocaleDateString([], { weekday: "long" })}
            {sameDay(dayCursor, today) ? " · Today" : ""}
          </div>
          <div className="day-only-sub">
            {dayCursor.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div className="day-view">
            {dayBlocks.length === 0 && <div className="week-empty">Nothing scheduled</div>}
            {dayBlocks.map((b, i) =>
              b.kind === "deadline" ? (
                <button
                  key={b.entry.id}
                  type="button"
                  className="day-card deadline pressable"
                  onClick={() => setEditing(b.entry)}
                >
                  <div className="day-card-time">
                    <b>{deadlineTime(b.entry)}</b>
                  </div>
                  <div className="day-card-body">
                    <div className="day-card-title">{b.entry.summary}</div>
                    {b.entry.businessId && b.entry.businessName && (
                      <div className="day-card-meta">
                        <span className="mini-biz">{b.entry.businessName}</span>
                      </div>
                    )}
                  </div>
                </button>
              ) : (
                <div
                  key={`p-${b.window.label}-${i}`}
                  className={`day-card protected${b.tentative ? " tentative" : ""}`}
                >
                  <div className="day-card-time">
                    <b>{windowTime(b.window)}</b>
                  </div>
                  <div className="day-card-body">
                    <div className="day-card-title">
                      {b.window.label}
                      {b.tentative && <span className="floats-tag">floats</span>}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </>
      )}

      {view === "month" && (
        <>
          <div className="month-title">{monthLabel}</div>
          <div className="month-weekdays">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="month-grid">
            {monthCells.map(({ date, inMonth, count }) => {
              const isToday = sameDay(date, today);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={`month-cell${inMonth ? "" : " other-month"}${isToday ? " today" : ""}`}
                  disabled={!inMonth}
                  onClick={() => {
                    setDayCursor(date);
                    setView("day");
                  }}
                >
                  <span className="num">{date.getDate()}</span>
                  {count > 0 && (
                    <span className="dots">
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <span key={i} className="dot" />
                      ))}
                      {count > 3 && <span className="dot more" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="month-legend">Tap a day to open it · dot = deadline that day</div>
        </>
      )}

      {view === "week" && (
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
      )}

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
            defaultDate={view === "day" ? dayCursor : undefined}
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
