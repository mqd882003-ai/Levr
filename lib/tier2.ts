import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { proposeCategory } from "@/lib/evolve";
import { recommendOwner, topPick } from "@/lib/routing";
import type {
  Business,
  Category,
  Correction,
  Delegation,
  Entry,
  Person,
  Project,
} from "@/lib/types";

// Phase 2 Tier 2: async consultant-grade second pass (requirements §Phase 2).
// Runs after the capture response is sent; never on the critical path.
const MODEL = "claude-sonnet-5";
const CORRECTIONS_WINDOW = 20;

export const PERSONA =
  "You are an experienced business operations consultant and chief of staff for a busy, " +
  "multi-business founder. Your job is to help them protect their time: flag what only they " +
  "should personally handle (strategy, key decisions, judgment calls unique to their position), " +
  "and what should be handed off to their team. You know their businesses, their team's track " +
  "record, and how they've corrected your past calls — use all of it to make a sharper call " +
  "than a first-pass guess would.";

export interface Tier2Context {
  businesses: Business[];
  projects: Project[];
  people: Person[];
  delegations: Delegation[];
  corrections: Correction[];
  categories: Category[];
}

export async function loadTier2Context(): Promise<Tier2Context> {
  const db = supabaseServer();
  const [businesses, projects, people, delegations, corrections, categories] = await Promise.all([
    db.from("businesses").select("*").order("created_at").then(unwrap<Business>),
    db.from("projects").select("*").then(unwrap<Project>),
    db.from("people").select("*").then(unwrap<Person>),
    db
      .from("delegations")
      .select("*")
      .order("assigned_at", { ascending: false })
      .limit(100)
      .then(unwrap<Delegation>),
    db
      .from("corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(CORRECTIONS_WINDOW)
      .then(unwrap<Correction>),
    db.from("categories").select("*").eq("status", "active").then(unwrap<Category>),
  ]);
  return { businesses, projects, people, delegations, corrections, categories };
}

// All dynamic text embedded via JSON.stringify (spec §Known failure mode).
export function buildTier2Prompt(entry: Entry, ctx: Tier2Context): string {
  const businessName = new Map(ctx.businesses.map((b) => [b.id, b.name]));
  const team = ctx.people.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role ?? "",
    business: p.business_id ? (businessName.get(p.business_id) ?? null) : null,
    capability_notes: p.capability_notes || "",
  }));
  const pastCorrections = ctx.corrections.map((c) => ({
    field: c.field,
    entry: c.entry_text,
    ai_guessed: c.from_value,
    founder_changed_to: c.to_value,
  }));
  const firstPass = {
    business: entry.business_id ? (businessName.get(entry.business_id) ?? null) : null,
    project: ctx.projects.find((p) => p.id === entry.project_id)?.name ?? null,
    is_leverage: entry.is_leverage,
    summary: entry.summary,
  };

  return (
    "A fast first-pass model already classified this captured thought. Review its call and " +
    "make the sharper final call.\n\n" +
    "Businesses: " + JSON.stringify(ctx.businesses.map((b) => b.name)) +
    "\nExisting projects: " + JSON.stringify(ctx.projects.map((p) => p.name)) +
    "\nTeam (capability notes): " + JSON.stringify(team) +
    "\nHow the founder has corrected past AI calls (most recent first): " +
    JSON.stringify(pastCorrections) +
    "\nTask categories (active vocabulary): " + JSON.stringify(ctx.categories.map((c) => c.name)) +
    "\n\nCaptured entry: " + JSON.stringify(entry.text) +
    "\nFirst-pass classification: " + JSON.stringify(firstPass) +
    "\n\nDecide:\n" +
    '- "business": exactly one name from the Businesses list, or null.\n' +
    '- "project": existing project name (fuzzy match), a short NEW 2-4 word name, or null.\n' +
    '- "is_leverage": true = founder-only; false = delegate-able; null only if truly undecidable.\n' +
    '- "summary": one board-readable line, max 12 words (keep the first-pass summary unless it misses the point).\n' +
    '- "checklist": when is_leverage is false, 2-5 short concrete sub-steps in order (imperative, max 8 words each); else [].\n' +
    '- "category": for delegate-able tasks, the single best fit from the active vocabulary, or null.\n' +
    '- "propose_category": ONLY if is_leverage is false and nothing in the vocabulary genuinely fits: a short 1-3 word new category name; else null.\n' +
    '- "reason": one sentence, only when you disagree with the first-pass is_leverage or business call; else null.\n' +
    '- "mentioned_new_people": names of real individuals (colleagues, collaborators, potential ' +
    "delegates) named in the text who are NOT already in the Team list above — max 5, plain names as " +
    "said. Never include passing references to clients, patients, or strangers who wouldn't belong on " +
    "the founder's team. Default to an empty array when unsure.\n\n" +
    'Reply with ONLY raw JSON, no markdown fences: {"business":...,"project":...,"is_leverage":...,' +
    '"summary":"...","checklist":[...],"category":...,"propose_category":...,' +
    '"reason":...,"mentioned_new_people":[...]}'
  );
}

interface Tier2Result {
  business: string | null;
  project: string | null;
  is_leverage: boolean | null;
  summary: string;
  checklist: string[];
  category: string | null;
  propose_category: string | null;
  reason: string | null;
  mentioned_new_people: string[];
}

function parseChecklist(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).slice(0, 5)
    : [];
}

function parseTier2(raw: string, ctx: Tier2Context, fallbackSummary: string): Tier2Result {
  const parsed: unknown = JSON.parse(raw.replace(/```json|```/g, "").trim());
  if (typeof parsed !== "object" || parsed === null) throw new Error("non-object JSON");
  const p = parsed as Record<string, unknown>;
  const business =
    typeof p.business === "string" && ctx.businesses.some((b) => b.name === p.business)
      ? (p.business as string)
      : null;
  const is_leverage = typeof p.is_leverage === "boolean" ? p.is_leverage : null;
  const existingNames = new Set(ctx.people.map((person) => person.name.toLowerCase()));
  return {
    business,
    project: typeof p.project === "string" && p.project.trim() ? p.project.trim() : null,
    is_leverage,
    summary:
      typeof p.summary === "string" && p.summary.trim() ? p.summary.trim() : fallbackSummary,
    checklist: parseChecklist(p.checklist),
    category:
      typeof p.category === "string" && ctx.categories.some((c) => c.name === p.category)
        ? (p.category as string)
        : null,
    propose_category:
      typeof p.propose_category === "string" && p.propose_category.trim()
        ? p.propose_category.trim()
        : null,
    reason: typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : null,
    mentioned_new_people: Array.isArray(p.mentioned_new_people)
      ? Array.from(
          new Set(
            p.mentioned_new_people.filter(
              (s): s is string => typeof s === "string" && Boolean(s.trim()),
            ),
          ),
        )
          .filter((name) => !existingNames.has(name.toLowerCase()))
          .slice(0, 5)
      : [],
  };
}

// The full async pass. Never throws — failures mark tier2_status='failed' and
// the entry simply stands as Tier 1 left it.
export async function runTier2(entryId: string): Promise<void> {
  const db = supabaseServer();
  try {
    const ctx = await loadTier2Context();
    const before = await db
      .from("entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle<Entry>();
    if (!before.data) return; // deleted while we waited — nothing to do
    const entry = before.data;

    const client = new Anthropic();
    // Sonnet 5 thinks adaptively by default and thinking spends max_tokens —
    // budget generously or the JSON output gets truncated mid-string.
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: PERSONA,
      messages: [{ role: "user", content: buildTier2Prompt(entry, ctx) }],
    });
    if (response.stop_reason === "max_tokens") {
      throw new Error("tier2 output truncated at max_tokens");
    }
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const result = parseTier2(raw, ctx, entry.summary ?? entry.text);

    const businessId = ctx.businesses.find((b) => b.name === result.business)?.id ?? null;
    const disagrees =
      result.is_leverage !== entry.is_leverage || businessId !== entry.business_id;

    // Guard: has the user acted since capture? (done, assigned, or corrected)
    const [fresh, delegation, corrected] = await Promise.all([
      db.from("entries").select("*").eq("id", entryId).maybeSingle<Entry>(),
      db
        .from("delegations")
        .select("id")
        .eq("entry_id", entryId)
        .limit(1)
        .maybeSingle<{ id: string }>(),
      db
        .from("corrections")
        .select("id")
        .eq("entry_id", entryId)
        .limit(1)
        .maybeSingle<{ id: string }>(),
    ]);
    if (!fresh.data) return;
    const userActed =
      fresh.data.status !== "open" ||
      Boolean(delegation.data) ||
      Boolean(corrected.data) ||
      // classification changed under us since we read it
      fresh.data.is_leverage !== entry.is_leverage ||
      fresh.data.business_id !== entry.business_id;

    if (userActed) {
      // Surface the disagreement, change nothing (spec: no silent flip).
      if (disagrees) {
        await db
          .from("entries")
          .update({
            tier2_status: "flagged",
            tier2_reason: result.reason ?? "Second look disagrees with the first-pass call.",
            tier2_at: new Date().toISOString(),
          })
          .eq("id", entryId);
      } else {
        await db
          .from("entries")
          .update({ tier2_status: "confirmed", tier2_at: new Date().toISOString() })
          .eq("id", entryId);
      }
      return;
    }

    // Resolve/create project for the revised call.
    const projectId = await resolveProjectId(db, result.project, businessId, entryId, ctx.projects);

    // Merge, never overwrite — Tier 1 may have already written strict,
    // explicitly-stated names to this same column; Tier 2's looser judgment
    // call only adds to that, it doesn't replace it.
    const mergedMentioned = Array.from(
      new Set([...(fresh.data.mentioned_people ?? []), ...result.mentioned_new_people]),
    );

    // Routing junction (routing-junction-handoff.md §3): classification
    // classifies, routing routes. With the revised category/business settled,
    // lib/routing.ts recomputes the owner suggestion — neither LLM pass picks
    // owners anymore.
    const finalCategory = result.category ?? entry.category;
    const suggestion =
      result.is_leverage === false
        ? (topPick(await recommendOwner(entryId, businessId, finalCategory))?.personId ?? null)
        : null;

    const changed =
      disagrees ||
      projectId !== entry.project_id ||
      suggestion !== entry.suggested_person_id ||
      result.summary !== entry.summary;
    await db
      .from("entries")
      .update({
        business_id: businessId,
        project_id: projectId,
        is_leverage: result.is_leverage,
        summary: result.summary,
        suggested_person_id: suggestion,
        category: finalCategory,
        tier2_status: changed ? "revised" : "confirmed",
        tier2_reason: result.reason,
        tier2_at: new Date().toISOString(),
        mentioned_people: mergedMentioned,
      })
      .eq("id", entryId);

    // A3.1: brand-new category proposals go to the Review batch, never applied silently.
    if (result.propose_category) await proposeCategory(result.propose_category);

    // Checklist only for delegated items, and only if none exists yet.
    if (result.is_leverage === false && result.checklist.length) {
      await insertChecklistIfNone(db, entryId, result.checklist);
    }
  } catch (err) {
    console.error("tier2 failed for", entryId, err);
    await db
      .from("entries")
      .update({ tier2_status: "failed", tier2_at: new Date().toISOString() })
      .eq("id", entryId)
      .then(() => {}, () => {});
  }
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

type Db = ReturnType<typeof supabaseServer>;

async function resolveProjectId(
  db: Db,
  projectName: string | null,
  businessId: string | null,
  createdFromEntryId: string | null,
  knownProjects: Project[],
): Promise<string | null> {
  if (!projectName) return null;
  const existing = knownProjects.find((p) => p.name.toLowerCase() === projectName.toLowerCase());
  if (existing) return existing.id;
  const created = await db
    .from("projects")
    .insert({ name: projectName, business_id: businessId, created_from_entry_id: createdFromEntryId })
    .select()
    .single<Project>();
  return created.data?.id ?? null;
}

async function insertChecklistIfNone(db: Db, entryId: string, items: string[]): Promise<void> {
  const existing = await db
    .from("checklist_items")
    .select("id")
    .eq("entry_id", entryId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.data) return;
  await db
    .from("checklist_items")
    .insert(items.map((text, i) => ({ entry_id: entryId, text, sort_order: i })));
}

// HANDOFF-personal-config-import.md task 3: Sonnet, not Haiku, owns "is this
// genuinely urgent enough to interrupt one of Dave's protected windows" — a
// judgment call against his override_rule, not the fast structured-output
// job Haiku is scoped to (levr-requirements.md § Classification backend).
export interface UrgencyAssessment {
  urgent: boolean;
  reason: string;
}

export async function assessProtectedWindowUrgency(
  taskText: string,
  windowLabel: string,
  overrideRule: string,
): Promise<UrgencyAssessment> {
  const client = new Anthropic();
  const prompt =
    "Dave is currently inside a protected personal window: " + JSON.stringify(windowLabel) + ".\n" +
    "His rule for when business is allowed to interrupt this time: " +
    JSON.stringify(overrideRule) +
    "\n\nA message is about to go out because of this task: " + JSON.stringify(taskText) +
    "\n\nIs this genuinely time-sensitive enough to send right now, per his rule? Default to " +
    "no unless it clearly qualifies (a real deadline or deal at risk) — when in doubt, hold.\n\n" +
    'Reply with ONLY raw JSON, no markdown fences: {"urgent": true|false, "reason": "one short sentence"}';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: PERSONA,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "max_tokens") {
    throw new Error("urgency check truncated at max_tokens");
  }
  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    urgent: parsed.urgent === true,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}
