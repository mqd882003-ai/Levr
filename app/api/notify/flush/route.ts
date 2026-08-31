import { NextResponse } from "next/server";
import { sendDecayDigest } from "@/lib/decayReminders";
import { sendDailyDeadlineDigest } from "@/lib/deadlineReminders";
import { flushHeldNotifications } from "@/lib/notify";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Vercel Cron hits this once a day (see vercel.json) to run three
// independent, unrelated jobs that all happen to fit a daily cadence,
// sharing one scheduled invocation rather than standing up several:
//   1. flushHeldNotifications — deliver assignment messages that were held
//      during one of Dave's protected windows, once it closes naturally
//      (HANDOFF-personal-config-import.md task 3). Also pushes Dave a
//      confirmation when one actually sends (013/014 web push Phase 3).
//   2. sendDailyDeadlineDigest — "what's due today" push (013 Phase 1).
//   3. sendDecayDigest — "needs a decision" push for A6-stale entries,
//      once per entry ever (013/014 Phase 2).
//
// Schedule is "30 13 * * *" — 6:30am Pacific during PDT (drifts to 5:30am
// during PST, Nov–Mar; Vercel Cron is UTC-only with no DST awareness) and
// only guaranteed to fire sometime within that UTC hour, not at the exact
// minute (Vercel's own documented behavior). This is Hobby plan's actual
// ceiling — sub-daily/precise cron timing needs a Pro upgrade. None of the
// three jobs above need per-minute precision; that's why they were reworked
// into daily digests instead of the originally-scoped 15-minutes-before
// timing (see PROJECT_STATE for that history).
//
// Gated by CRON_SECRET, which Vercel sends automatically as a Bearer token
// for scheduled invocations — reject anything else so this can't be hit to
// force sends on demand.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }
  const [held, deadlineDigest, decayDigest] = await Promise.all([
    flushHeldNotifications(),
    sendDailyDeadlineDigest(),
    sendDecayDigest(),
  ]);
  return NextResponse.json({ held, deadlineDigest, decayDigest });
}
