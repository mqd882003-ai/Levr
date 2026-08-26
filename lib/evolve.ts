import Anthropic from "@anthropic-ai/sdk";
import { PERSONA } from "@/lib/tier2";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppSettings, Category, Delegation, Person } from "@/lib/types";

// A2/A3 background machinery. Everything here runs off the critical path
// (after() from closeout) and fails silently — the closeout itself never waits.
const MODEL = "claude-sonnet-5";

// A2: the system's portion of capability_notes lives BELOW this marker.
// Everything above it is Dave's and is never touched.
export const AUTO_MARKER = "⸻ Levr's read ⸻";

export function splitNotes(notes: string): { manual: string; auto: string } {
  const idx = notes.indexOf(AUTO_MARKER);
  if (idx === -1) return { manual: notes, auto: "" };
  return {
    manual: notes.slice(0, idx).trimEnd(),
    auto: notes.slice(idx + AUTO_MARKER.length).trim(),
  };
}

export function mergeNotes(manual: string, auto: string): string {
  const head = manual.trimEnd();
  if (!auto.trim()) return head;
  return (head ? head + "\n\n" : "") + AUTO_MARKER + "\n" + auto.trim();
}

// A3.1: propose a category (status 'proposed') unless any category with that
// name already exists in either status. Never interrupts anything — proposals
// surface in the Review with me batch.
export async function proposeCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40) return;
  const db = supabaseServer();
  const existing = await db
    .from("categories")
    .select("id")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.data) return;
  await db.from("categories").insert({ name: trimmed, status: "proposed" });
}

// A2: regenerate the auto portion of a person's capability notes from their
// resolved history. Gated by the Settings toggle and a 3-task floor.
export async function synthesizeNotes(personId: string): Promise<void> {
  const db = supabaseServer();
  try {
    const settings = await db
      .from("app_settings")
      .select("auto_notes")
      .eq("id", true)
      .maybeSingle<Pick<AppSettings, "auto_notes">>();
    if (!settings.data?.auto_notes) return;

    const [personRes, historyRes] = await Promise.all([
      db.from("people").select("*").eq("id", personId).maybeSingle<Person>(),
      db
        .from("delegations")
        .select("*")
        .eq("person_id", personId)
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(25),
    ]);
    const person = personRes.data;
    const history = (historyRes.data ?? []) as Delegation[];
    if (!person || history.length < 3) return;

    const { manual } = splitNotes(person.capability_notes ?? "");
    const evidence = history.map((d) => ({
      task: d.expected_outcome,
      category: d.category,
      outcome: d.actual_outcome,
      verdict: d.verdict,
      diagnosis: d.diagnosis, // only not_ready / no_follow_through are on them
      note: d.outcome_note,
      when: d.resolved_at,
    }));

    const prompt =
      "Write the rolling capability read for one team member, from their delegation history.\n\n" +
      "Person: " + JSON.stringify({ name: person.name, role: person.role }) +
      "\nFounder's own manual notes (context only — do NOT restate or edit them): " +
      JSON.stringify(manual) +
      "\nResolved delegation history, newest first: " + JSON.stringify(evidence) +
      "\n\nRules:\n" +
      "- 1 to 3 short plain-language lines, grouped by pattern (strengths first), e.g. " +
      '"Reliable on cold calls (4/4). Client-facing: 2 recent misses - pair with a clearer brief."\n' +
      "- Diagnostic, never punitive: diagnoses like unclear_brief / bandwidth / blocked are NOT the " +
      "person's misses - do not count them against the person; misses that count are only " +
      "not_ready and no_follow_through (or legacy rows with not_done/pull_back and no diagnosis).\n" +
      "- Weight recent outcomes over old ones. Mention counts so the read is traceable.\n" +
      "- No headers, no bullets, no judgment words like 'failed' or 'untrustworthy'.\n\n" +
      'Reply ONLY raw JSON: {"summary": "..."}';

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: PERSONA,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "max_tokens") throw new Error("truncated");
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(raw) as { summary?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summary) return;

    // Re-read right before writing so a concurrent manual edit isn't clobbered.
    const fresh = await db
      .from("people")
      .select("capability_notes")
      .eq("id", personId)
      .maybeSingle<Pick<Person, "capability_notes">>();
    const freshManual = splitNotes(fresh.data?.capability_notes ?? "").manual;
    await db
      .from("people")
      .update({ capability_notes: mergeNotes(freshManual, summary) })
      .eq("id", personId);
  } catch (err) {
    console.error("synthesizeNotes failed for", personId, err);
  }
}

// A3.1 fallback: a delegation being closed whose entry never got a category
// (captured before 003, or classifier abstained) gets one now — cheap Haiku
// call against the active vocabulary, optionally proposing a new name.
export async function categorizeDelegation(delegationId: string): Promise<void> {
  const db = supabaseServer();
  try {
    const delegation = await db
      .from("delegations")
      .select("*")
      .eq("id", delegationId)
      .maybeSingle<Delegation>();
    if (!delegation.data || delegation.data.category) return;

    const cats = await db
      .from("categories")
      .select("*")
      .eq("status", "active")
      .then((r) => (r.data ?? []) as Category[]);
    const task = delegation.data.expected_outcome ?? "";
    if (!task) return;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            "Pick the single best category for this delegated task.\n" +
            "Categories: " + JSON.stringify(cats.map((c) => c.name)) +
            "\nTask: " + JSON.stringify(task) +
            '\nIf none genuinely fits, set "category" to null and give "propose" a short 1-3 word new category name; else "propose" is null.\n' +
            'Reply ONLY raw JSON: {"category": ..., "propose": ...}',
        },
      ],
    });
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(raw) as { category?: unknown; propose?: unknown };
    const category =
      typeof parsed.category === "string" &&
      cats.some((c) => c.name === parsed.category)
        ? (parsed.category as string)
        : null;
    if (category) {
      await db.from("delegations").update({ category }).eq("id", delegationId);
      await db
        .from("entries")
        .update({ category })
        .eq("id", delegation.data.entry_id)
        .is("category", null);
    } else if (typeof parsed.propose === "string" && parsed.propose.trim()) {
      await proposeCategory(parsed.propose);
    }
  } catch (err) {
    console.error("categorizeDelegation failed for", delegationId, err);
  }
}
