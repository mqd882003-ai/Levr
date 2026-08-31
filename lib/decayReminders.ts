import { supabaseServer } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import type { Delegation, Entry } from "@/lib/types";

// Phase 2 — A6 decay push. Mirrors EntryRow.tsx's client-side `stale` chip
// exactly (same threshold, same unsorted/unowned definition, same parked
// exclusion) so the push and the on-screen "Needs a decision" tag never
// disagree about which entries qualify. Runs on the same daily cron as the
// deadline digest and held-notification flush (see app/api/notify/flush) —
// same Hobby-plan once-daily cadence, no per-minute precision needed here
// either (a 6-day threshold doesn't care which hour it's checked).
const DECAY_MS = 6 * 86_400_000;
const MAX_LISTED = 5;

function summaryOf(entry: Pick<Entry, "summary" | "text">): string {
  return entry.summary || entry.text;
}

// Never throws — a failed decay pass must never take the whole cron
// invocation down with it.
export async function sendDecayDigest(): Promise<{ checked: number; sent: number }> {
  try {
    const db = supabaseServer();
    const cutoff = new Date(Date.now() - DECAY_MS).toISOString();
    const res = await db
      .from("entries")
      .select("id, summary, text, is_leverage, parked_until, captured_at, status")
      .eq("status", "open")
      .is("decay_notified_at", null)
      .lt("captured_at", cutoff);
    const candidates = (res.data ?? []) as Pick<
      Entry,
      "id" | "summary" | "text" | "is_leverage" | "parked_until" | "captured_at" | "status"
    >[];
    if (!candidates.length) return { checked: 0, sent: 0 };

    // Same "most recent delegation, resolved or not, counts as owned" rule
    // as lib/boardEntries.ts's ownerId — an entry that was ever assigned
    // never reads as unowned again, even after that delegation resolved.
    const delegationsRes = await db
      .from("delegations")
      .select("entry_id, person_id, assigned_at")
      .in(
        "entry_id",
        candidates.map((e) => e.id),
      )
      .order("assigned_at", { ascending: false });
    const delegations = (delegationsRes.data ?? []) as Pick<
      Delegation,
      "entry_id" | "person_id" | "assigned_at"
    >[];
    const ownerByEntry = new Map<string, string | null>();
    for (const d of delegations) {
      if (!ownerByEntry.has(d.entry_id)) ownerByEntry.set(d.entry_id, d.person_id);
    }

    const now = Date.now();
    const decayed = candidates.filter((e) => {
      const parked = Boolean(e.parked_until && new Date(e.parked_until).getTime() > now);
      if (parked) return false;
      const ownerId = ownerByEntry.get(e.id) ?? null;
      return e.is_leverage === null || (e.is_leverage === false && !ownerId);
    });
    if (!decayed.length) return { checked: candidates.length, sent: 0 };

    const labels = decayed.map(summaryOf);
    const shown = labels.slice(0, MAX_LISTED);
    const extra = labels.length - shown.length;
    await sendPush({
      title: decayed.length === 1 ? "1 item needs a decision" : `${decayed.length} items need a decision`,
      body: shown.join("; ") + (extra > 0 ? ` (+${extra} more)` : ""),
      url: "/board",
    });

    // Once, ever — per spec, not repeated every day it stays decayed. If it
    // later gets resolved and somehow decays again, that's a fresh look a
    // human already had a chance to take; no re-notify.
    const notifiedAt = new Date().toISOString();
    await db
      .from("entries")
      .update({ decay_notified_at: notifiedAt })
      .in("id", decayed.map((e) => e.id));

    return { checked: candidates.length, sent: decayed.length };
  } catch (err) {
    console.error("sendDecayDigest failed:", err);
    return { checked: 0, sent: 0 };
  }
}
