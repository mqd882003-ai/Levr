import { NextResponse, after } from "next/server";
import { classifyCapture, type ClassifyContext, type Chunk } from "@/lib/classify";
import { runTier2 } from "@/lib/tier2";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import type {
  Business,
  BusinessSettings,
  Category,
  Delegation,
  Entry,
  Person,
  Project,
  ProjectType,
} from "@/lib/types";

export const runtime = "nodejs";

// Capture + classify. The entry is inserted FIRST, then classified — a
// classification failure must never lose the captured thought; the entry just
// lands unclassified (is_leverage null → Board's "Needs a look").
//
// Tier 1 (Haiku) may split the capture into multiple logical chunks (genuinely
// different businesses/tasks, not just a long single thought). The
// first-inserted entry is always the anchor (split_from_entry_id stays null);
// any further chunks are inserted as siblings pointing split_from_entry_id at
// the anchor. A single-chunk capture — the common case — behaves exactly as
// before: one entry, updated in place.
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
  const entry = inserted.data; // the anchor if Tier 1 returns more than one chunk

  try {
    const [businesses, projects, people, delegations, categories, businessSettingsRes] =
      await Promise.all([
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
        db.from("business_settings").select("business_id, project_type"),
      ]);
    const businessProjectType: Record<string, ProjectType> = {};
    for (const bs of (businessSettingsRes.data ?? []) as Pick<
      BusinessSettings,
      "business_id" | "project_type"
    >[]) {
      businessProjectType[bs.business_id] = bs.project_type;
    }
    const ctx: ClassifyContext = { businesses, businessProjectType, projects, people, delegations, categories };

    const chunks = await classifyCapture(entry.text, ctx);

    // Resolve/create a project for a chunk. Tracks newly-created projects
    // locally so two chunks in the same capture wanting the same new project
    // name reuse it instead of creating a duplicate.
    const knownProjects: Project[] = [...projects];
    async function resolveProjectId(chunk: Chunk, businessId: string | null): Promise<string | null> {
      if (!chunk.project) return null;
      const existing = knownProjects.find(
        (p) => p.name.toLowerCase() === chunk.project!.toLowerCase(),
      );
      if (existing) return existing.id;
      const created = await db
        .from("projects")
        .insert({ name: chunk.project, business_id: businessId, created_from_entry_id: entry.id })
        .select()
        .single<Project>();
      if (created.data) knownProjects.push(created.data);
      return created.data?.id ?? null;
    }

    const createdIds: string[] = [];
    let anchorEntry: Entry = entry;
    let anchorBusinessName: string | null = null;
    let anchorProjectName: string | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const businessId = businesses.find((b) => b.name === chunk.business)?.id ?? null;
      const projectId = await resolveProjectId(chunk, businessId);
      const fields = {
        text: chunk.text,
        summary: chunk.summary,
        business_id: businessId,
        project_id: projectId,
        is_leverage: chunk.is_leverage,
        suggested_person_id: chunk.suggested_owner_id,
        category: chunk.category,
        mentioned_people: chunk.mentioned_people,
        explicit_deadline: chunk.explicit_deadline,
        stated_reason: chunk.stated_reason,
      };

      if (i === 0) {
        const updated = await db.from("entries").update(fields).eq("id", entry.id).select().single<Entry>();
        anchorEntry = updated.data ?? entry;
        anchorBusinessName = businesses.find((b) => b.id === businessId)?.name ?? null;
        anchorProjectName = chunk.project
          ? (knownProjects.find((p) => p.id === projectId)?.name ?? chunk.project)
          : null;
        createdIds.push(entry.id);
      } else {
        const created = await db
          .from("entries")
          .insert({ ...fields, source: entrySource, split_from_entry_id: entry.id })
          .select()
          .single<Entry>();
        if (created.data) createdIds.push(created.data.id);
      }
    }

    // Phase 2 Tier 2: consultant-grade second pass, per chunk, off the
    // critical path. after() awaits whatever the callback returns, so this
    // waits for every chunk's pass, not just the first.
    after(() => Promise.all(createdIds.map((id) => runTier2(id))));

    return NextResponse.json({
      entry: anchorEntry,
      classified: true,
      // Resolved names so the client can render the new row without a refetch.
      business_name: anchorBusinessName,
      project_name: anchorProjectName,
      // Present when Tier 1 split the capture — siblings appear on Board on
      // next load; the client doesn't flash/toast them individually yet.
      additionalChunks: createdIds.length - 1,
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
