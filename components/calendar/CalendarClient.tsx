"use client";

import { useMemo, useState } from "react";
import type { Entry, ProtectedWindow } from "@/lib/types";

// Week view per reference/levr-combined-prototype.html. Three block kinds:
// - deadline (timed or all-day): entries placed on their parsed deadline_at day
// - protected (precise): windows with real clock times on known days
// - tentative: windows whose schedule the data can't actually pin down
//   (frequency like "4-5x/week", or no clock time) — shown floating across
//   days, styled distinctly, never omitted and never faked as precise.
// Entries whose deadline text couldn't parse to a date live in the undated
// strip up top — visible, just not pinned to a day the data doesn't support.

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

function deadlineTime(e: Entry): string {
  if (e.deadline_all_day || !e.deadline_at) return "All day";
  return new Date(e.deadline_at)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

export default function CalendarClient({
  entries,
  windows,
  businessNames,
}: {
  entries: Entry[];
  windows: ProtectedWindow[];
  businessNames: Record<string, string>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const weekStart = new Date(startOfWeek(today).getTime() + weekOffset * 7 * DAY_MS);

  const undated = useMemo(() => entries.filter((e) => !e.deadline_at), [entries]);
  const dated = useMemo(() => entries.filter((e) => e.deadline_at), [entries]);

  const expandedWindows = useMemo(() => windows.map((w) => ({ w, exp: expandWindow(w) })), [windows]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * DAY_MS);
    const dayEntries = dated
      .filter((e) => sameDay(new Date(e.deadline_at!), date))
      .sort((a, b) => {
        if (a.deadline_all_day !== b.deadline_all_day) return a.deadline_all_day ? 1 : -1;
        return a.deadline_at!.localeCompare(b.deadline_at!);
      });
    const dayWindows: DayWindow[] = expandedWindows
      .filter(({ exp }) => exp.days.includes(date.getDay()))
      .map(({ w, exp }) => ({ window: w, tentative: exp.tentative }));
    return { date, dayEntries, dayWindows };
  });

  const weekLabel = weekStart.toLocaleDateString([], { month: "short", day: "numeric" });

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
            <div key={e.id} className="mini-block undated">
              <span className="mini-time">?</span>
              <span className="mini-label">
                {e.summary}
                <span className="undated-raw">&ldquo;{e.explicit_deadline}&rdquo;</span>
              </span>
            </div>
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
                <div key={e.id} className="mini-block deadline">
                  <span className="mini-time">{deadlineTime(e)}</span>
                  <span className="mini-label">
                    {e.summary}
                    {e.business_id && businessNames[e.business_id] && (
                      <span className="mini-biz">{businessNames[e.business_id]}</span>
                    )}
                  </span>
                </div>
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
    </section>
  );
}
