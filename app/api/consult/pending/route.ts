import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slim status feed for the global consult watcher (intent-router-handoff §4):
// it needs just enough to notice a consult flipping processing → confirmed so
// it can toast when the founder wandered off Board before Tier 2 resolved.
export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ consults: [] });
  const db = supabaseServer();
  const res = await db
    .from("entries")
    .select("id, intent_status")
    .eq("capture_intent", "consult")
    .eq("status", "open")
    .in("intent_status", ["processing", "confirmed"]);
  return NextResponse.json({
    consults: (res.data ?? []) as Array<{ id: string; intent_status: string }>,
  });
}
