import { supabaseServer } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import type { Entry } from "@/lib/types";

// Phase 1 — Calendar deadline reminders. Originally scoped as "15 min
// before/8am-of" precision pushes, but Vercel Hobby only guarantees a daily
// cron (see vercel.json / PROJECT_STATE — Pro upgrade needed for sub-daily
// timing). Reworked into a once-a-day digest instead of chasing precision
// this cadence can't deliver: "what's due today", sent on the single daily
// run rather than near an exact minute.
const TIMEZONE = "America/Los_Angeles";

// The daily cron can only ever announce what existed as of that run. An
// entry captured with a same-day deadline AFTER today's run gets no chance
// to appear as "today" again — by tomorrow's run its deadline date reads as
// yesterday. A 1-day lookback catches exactly that gap (and a single missed
// cron day) without reaching back far enough to dump a backlog of ancient
// overdue items the moment this ships.
const LOOKBACK_DAYS = 1;
const MAX_LISTED = 5;

function pacificDayIndex(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
}

function summaryOf(entry: Pick<Entry, "summary" | "text">): string {
  return entry.summary || entry.text;
}

// Run on the daily cron (see app/api/notify/flush). Never throws — a failed
// digest pass must never take the whole cron invocation down with it.
export async function sendDailyDeadlineDigest(): Promise<{ checked: number; sent: number }> {
  try {
    const db = supabaseServer();
    const res = await db
      .from("entries")
      .select("id, summary, text, deadline_at, status")
      .eq("status", "open")
      .is("deadline_reminder_sent_at", null)
      .not("deadline_at", "is", null);
    const entries = (res.data ?? []) as Pick<
      Entry,
      "id" | "summary" | "text" | "deadline_at" | "status"
    >[];
    if (!entries.length) return { checked: 0, sent: 0 };

    const today = pacificDayIndex(new Date().toISOString());
    const due = entries.filter((e) => {
      if (!e.deadline_at) return false;
      const day = pacificDayIndex(e.deadline_at);
      return day <= today && day >= today - LOOKBACK_DAYS;
    });
    if (!due.length) return { checked: entries.length, sent: 0 };

    const labels = due.map(summaryOf);
    const shown = labels.slice(0, MAX_LISTED);
    const extra = labels.length - shown.length;
    await sendPush({
      title: due.length === 1 ? "1 item due today" : `${due.length} items due today`,
      body: shown.join("; ") + (extra > 0 ? ` (+${extra} more)` : ""),
      url: "/calendar",
    });

    // Marked sent regardless of subscriber count — a digest window that
    // passed with push off has nothing useful to deliver later; same
    // at-most-once semantics as the SMS side, not a delivery guarantee.
    const sentAt = new Date().toISOString();
    await db
      .from("entries")
      .update({ deadline_reminder_sent_at: sentAt })
      .in("id", due.map((e) => e.id));

    return { checked: entries.length, sent: due.length };
  } catch (err) {
    console.error("sendDailyDeadlineDigest failed:", err);
    return { checked: 0, sent: 0 };
  }
}
