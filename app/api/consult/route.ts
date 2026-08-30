import { NextResponse } from "next/server";
import { consultReply, type ConsultTurn } from "@/lib/consult";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { loadTier2Context } from "@/lib/tier2";
import type { Entry } from "@/lib/types";

export const runtime = "nodejs";

const MAX_TURNS = 40;
const MAX_TURN_CHARS = 4000;

// One reply in a consult conversation (intent-router-handoff §4, Gap 5).
// Ephemeral by design: the turns come from the client's memory and NOTHING
// here is persisted — the assistant advises, it never decides or files.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { entryId, turns } = (body ?? {}) as { entryId?: unknown; turns?: unknown };
  if (typeof entryId !== "string" || !entryId) {
    return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  }
  const parsedTurns: ConsultTurn[] = Array.isArray(turns)
    ? turns
        .filter(
          (t): t is { role: string; text: string } =>
            typeof t === "object" &&
            t !== null &&
            ((t as { role?: unknown }).role === "user" ||
              (t as { role?: unknown }).role === "assistant") &&
            typeof (t as { text?: unknown }).text === "string",
        )
        .slice(-MAX_TURNS)
        .map((t) => ({
          role: t.role as ConsultTurn["role"],
          text: t.text.slice(0, MAX_TURN_CHARS),
        }))
    : [];

  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const db = supabaseServer();
  const entryRes = await db
    .from("entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle<Entry>();
  const entry = entryRes.data;
  if (!entry || entry.capture_intent !== "consult") {
    return NextResponse.json({ error: "Not a consult entry" }, { status: 404 });
  }

  try {
    const ctx = await loadTier2Context();
    const reply = await consultReply(entry.text, parsedTurns, ctx);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("consult turn failed for", entryId, err);
    return NextResponse.json(
      { error: "Couldn't think that one through — try again" },
      { status: 500 },
    );
  }
}
