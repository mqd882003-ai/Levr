import { NextResponse } from "next/server";
import { flushHeldNotifications } from "@/lib/notify";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Vercel Cron hits this on a schedule (see vercel.json) to deliver assignment
// messages that were held during one of Dave's protected windows, once the
// window closes naturally (HANDOFF-personal-config-import.md task 3).
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
  const result = await flushHeldNotifications();
  return NextResponse.json(result);
}
