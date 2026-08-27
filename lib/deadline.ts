import * as chrono from "chrono-node";

// The whole app's day-boundary assumption is Dave's wall clock, same as the
// notification windows (see lib/notify.ts) — NOT the server's UTC. Without
// this, "by friday" captured Thursday evening Pacific parses as Friday UTC
// and can land a day off.
const TIMEZONE = "America/Los_Angeles";

export interface ParsedDeadline {
  deadline_at: string | null; // ISO timestamp, or null when nothing parseable
  deadline_all_day: boolean; // true = date known but no clock time stated
}

// Derives the machine-readable deadline from the verbatim explicit_deadline
// text, anchored to the capture moment — parse ONCE at save time, never at
// render time, so relative phrases ("next tuesday", "tomorrow") stay pinned
// to what they meant when spoken. Vague/event-relative deadlines ("before
// yana rolls it out", "at some point") parse to nothing and stay null —
// Calendar shows those in its undated strip instead of inventing a date.
export function parseDeadline(raw: string | null, anchor: Date): ParsedDeadline {
  const none: ParsedDeadline = { deadline_at: null, deadline_all_day: false };
  if (!raw || !raw.trim()) return none;
  try {
    const results = chrono.parse(
      raw,
      { instant: anchor, timezone: TIMEZONE },
      { forwardDate: true }, // a bare "tuesday" means the upcoming one
    );
    if (!results.length) return none;
    const start = results[0].start;
    // Needs at least a day, weekday, or clock time actually stated. A bare
    // "next month" / "in 2027" implies a day chrono invents — too vague to
    // pin; those go to the undated strip. A bare "by 2pm" is fine: the day
    // is legitimately implied from the capture moment (forwardDate).
    if (!start.isCertain("day") && !start.isCertain("weekday") && !start.isCertain("hour"))
      return none;
    return {
      deadline_at: start.date().toISOString(),
      deadline_all_day: !start.isCertain("hour"),
    };
  } catch {
    // A parser crash must never break capture — worst case the deadline just
    // stays undated.
    return none;
  }
}
