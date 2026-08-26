import { NextResponse, after } from "next/server";
import { classifyEntry, type ClassifyContext } from "@/lib/classify";
import { runTier2 } from "@/lib/tier2";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import type { Business, Category, Delegation, Entry, Person, Project } from "@/lib/types";

export const runtime = "nodejs";

// Capture + classify. The entry is inserted FIRST, then classified — a
// classification failure must never lose the captured thought; the entry just
// lands unclassified (is_leverage null → Board's "Needs a look").
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { text, source } = (body ?? {}) as { text?: unknown; source?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const entrySource = source === "voice" ? "voice" : "text";

  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured — fill in .env.local." },
      { status: 503 },
    );
  }
  const db = supabaseServer();

  const inserted = await db
    .from("entries")
    .insert({ text: text.trim(), source: entrySource })
    .select()
    .single<Entry>();
  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: "Could not save the entry: " + (inserted.error?.message ?? "unknown") },
      { status: 500 },
    );
  }
  const entry = inserted.data;

  try {
    const [businesses, projects, people, delegations, categories] = await Promise.all([
      db.from("businesses").select("*").order("created_at").then(unwrap<Business>),
      db.from("projects").select("*").then(unwrap<Project>),
      db.from("people").select("*").then(unwrap<Person>),
      db
        .from("delegations")
        .select("*")
        .order("assigned_at", { ascending: false })
        .limit(100)
        .then(unwrap<Delegation>),
      db.from("categories").select("*").eq("status", "active").then(unwrap<Category>),
    ]);
    const ctx: ClassifyContext = { businesses, projects, people, delegations, categories };

    const result = await classifyEntry(entry.text, ctx);

    const businessId =
      businesses.find((b) => b.name === result.business)?.id ?? null;

    let projectId: string | null = null;
    let projectName: string | null = null;
    if (result.project) {
      const existing = projects.find(
        (p) => p.name.toLowerCase() === result.project!.toLowerCase(),
      );
      if (existing) {
        projectId = existing.id;
        projectName = existing.name;
      } else {
        const created = await db
          .from("projects")
          .insert({
            name: result.project,
            business_id: businessId,
            created_from_entry_id: entry.id,
          })
          .select()
          .single<Project>();
        projectId = created.data?.id ?? null;
        projectName = created.data?.name ?? result.project;
      }
    }

    const updated = await db
      .from("entries")
      .update({
        summary: result.summary,
        business_id: businessId,
        project_id: projectId,
        is_leverage: result.is_leverage,
        suggested_person_id: result.suggested_owner_id,
        category: result.category,
      })
      .eq("id", entry.id)
      .select()
      .single<Entry>();

    // Phase 2 Tier 2: consultant-grade second pass, off the critical path.
    after(() => runTier2(entry.id));

    return NextResponse.json({
      entry: updated.data ?? entry,
      classified: true,
      // Resolved names so the client can render the new row without a refetch.
      business_name: businesses.find((b) => b.id === businessId)?.name ?? null,
      project_name: projectName,
    });
  } catch (err) {
    // Entry is already saved — surface it unclassified rather than failing.
    console.error("classification failed:", err);
    after(() => runTier2(entry.id));
    return NextResponse.json({ entry, classified: false });
  }
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}
