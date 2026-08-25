import { NextResponse } from "next/server";
import { notifyAssignment } from "@/lib/notify";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Manual trigger for the single assignment message (same path saveEntry uses
// internally) — useful for a deliberate resend after a failed send. Never
// called on any schedule.
export async function POST(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }
  let body: { delegationId?: unknown };
  try {
    body = (await request.json()) as { delegationId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.delegationId !== "string" || !body.delegationId) {
    return NextResponse.json({ error: "delegationId is required" }, { status: 400 });
  }
  const result = await notifyAssignment(body.delegationId);
  return NextResponse.json(result, { status: result.error ? 502 : 200 });
}
