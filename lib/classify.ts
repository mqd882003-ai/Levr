import Anthropic from "@anthropic-ai/sdk";
import type { Business, Classification, Delegation, Person, Project } from "@/lib/types";

// Per docs/levr-requirements.md § Classification backend: short structured-output
// task, pinned to Haiku 4.5. Do not upgrade without a concrete accuracy reason.
const MODEL = "claude-haiku-4-5-20251001";

export interface ClassifyContext {
  businesses: Business[];
  projects: Project[];
  people: Person[];
  delegations: Delegation[]; // recent history, used to weigh owner suggestions
}

// All dynamic text is embedded via JSON.stringify — never hand-escaped
// (docs/levr-requirements.md § Known failure mode to avoid).
export function buildPrompt(text: string, ctx: ClassifyContext): string {
  const businessNames = ctx.businesses.map((b) => b.name);
  const projectNames = ctx.projects.map((p) => p.name);
  const team = ctx.people.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role ?? "",
    business: ctx.businesses.find((b) => b.id === p.business_id)?.name ?? null,
    capability_notes: p.capability_notes || "",
    recent_delegations: ctx.delegations
      .filter((d) => d.person_id === p.id)
      .slice(0, 5)
      .map((d) => ({
        outcome: d.actual_outcome,
        verdict: d.verdict,
        note: d.outcome_note ?? "",
      })),
  }));

  return (
    "You are sorting a busy entrepreneur's raw thought into structured data.\n\n" +
    "Businesses: " + JSON.stringify(businessNames) +
    "\nExisting projects: " + JSON.stringify(projectNames) +
    "\nTeam (with capability notes and recent delegation verdicts): " + JSON.stringify(team) +
    "\n\nEntry: " + JSON.stringify(text) +
    "\n\nDecide:\n" +
    '- "business": which business this belongs to — exactly one name from the Businesses list, or null if unclear.\n' +
    '- "project": an existing project name it belongs to (fuzzy match), or a short NEW 2-4 word project name if it clearly starts one, or null.\n' +
    '- "is_leverage": true if this is founder-only work (strategy, judgment, key relationships, pricing, hiring); false if operational/repeatable work someone else could do; null only if genuinely impossible to tell.\n' +
    '- "summary": the entry compressed to one board-readable line, max 12 words.\n' +
    '- "suggested_owner_id": only when is_leverage is false — the id of the best team member, weighing role, capability notes, and past verdicts. Rule out anyone whose notes or history say pull-back on similar work. Otherwise null.\n\n' +
    'Reply with ONLY raw JSON, no markdown fences: {"business":...,"project":...,"is_leverage":...,"summary":"...","suggested_owner_id":...}'
  );
}

export async function classifyEntry(
  text: string,
  ctx: ClassifyContext,
): Promise<Classification> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY server-side
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: buildPrompt(text, ctx) }],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Classifier returned non-object JSON");
  }
  const p = parsed as Record<string, unknown>;

  // Validate every field against known data — the model's output is untrusted.
  const business =
    typeof p.business === "string" &&
    ctx.businesses.some((b) => b.name === p.business)
      ? (p.business as string)
      : null;
  const project =
    typeof p.project === "string" && p.project.trim() ? p.project.trim() : null;
  const is_leverage = typeof p.is_leverage === "boolean" ? p.is_leverage : null;
  const summary =
    typeof p.summary === "string" && p.summary.trim() ? p.summary.trim() : text;
  const suggested_owner_id =
    is_leverage === false &&
    typeof p.suggested_owner_id === "string" &&
    ctx.people.some((person) => person.id === p.suggested_owner_id)
      ? (p.suggested_owner_id as string)
      : null;

  return { business, project, is_leverage, summary, suggested_owner_id };
}
