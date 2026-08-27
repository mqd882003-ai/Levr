import Anthropic from "@anthropic-ai/sdk";
import type { Business, Category, Delegation, Person, Project, ProjectType } from "@/lib/types";

// Per docs/levr-requirements.md § Classification backend: short structured-output
// task, pinned to Haiku 4.5. Do not upgrade without a concrete accuracy reason.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_CHUNKS = 5;

export interface ClassifyContext {
  businesses: Business[];
  businessProjectType: Record<string, ProjectType>;
  projects: Project[];
  people: Person[];
  delegations: Delegation[]; // recent history, used to weigh owner suggestions
  categories: Category[]; // active task-category vocabulary (A3)
}

// One logical chunk of a capture. Most captures are a single chunk; a chunk
// only splits off when the text genuinely narrates a separate concern
// (different business, different task) — never just because it's long.
export interface Chunk {
  text: string; // full text of just this chunk, verbatim, no length limit — never shortened
  business: string | null;
  project: string | null;
  is_leverage: boolean | null;
  summary: string;
  suggested_owner_id: string | null;
  category: string | null;
  mentioned_people: string[]; // explicitly-named people not already in Team — strict, no inference
  explicit_deadline: string | null; // literal deadline text, or null — never inferred
  stated_reason: string | null; // short quote of an explicitly given reason, or null — never inferred
}

// All dynamic text is embedded via JSON.stringify — never hand-escaped
// (docs/levr-requirements.md § Known failure mode to avoid).
export function buildPrompt(text: string, ctx: ClassifyContext): string {
  const businesses = ctx.businesses.map((b) => ({
    name: b.name,
    project_type: ctx.businessProjectType[b.id] ?? "delegatable",
  }));
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
    "Businesses (with project_type — a 'personal_project' business has no one to delegate to, " +
    "so is_leverage is always true there, no judgment needed): " + JSON.stringify(businesses) +
    "\nExisting projects: " + JSON.stringify(projectNames) +
    "\nTeam (with capability notes and recent delegation verdicts): " + JSON.stringify(team) +
    "\nTask categories: " + JSON.stringify(ctx.categories.map((c) => c.name)) +
    "\n\nCaptured entry: " + JSON.stringify(text) +
    "\n\nFirst, decide whether this is genuinely ONE continuous thought, or whether it narrates " +
    "separate concerns — different business, different task, unrelated purpose. Being long is " +
    "NOT by itself a reason to split. Most captures are a single chunk; only split when the " +
    "founder is clearly moving between distinct concerns in the same breath.\n\n" +
    "Then, for EACH chunk, decide:\n" +
    '- "text": the full original text of just this chunk, verbatim, no length limit and never ' +
    "shortened — the record of what was actually said.\n" +
    '- "business": which business this belongs to — exactly one name from the Businesses list, or null if unclear.\n' +
    '- "project": an existing project name it belongs to (fuzzy match), or a short NEW 2-4 word project name if it clearly starts one, or null.\n' +
    '- "is_leverage": true if this is founder-only work (strategy, judgment, key relationships, pricing, hiring); false if operational/repeatable work someone else could do; ' +
    "ALWAYS true when the business's project_type is personal_project; null only if genuinely impossible to tell.\n" +
    '- "summary": this chunk compressed to one board-readable line, max 12 words.\n' +
    '- "suggested_owner_id": only when is_leverage is false — the id of the best team member, weighing role, capability notes, and past verdicts. Rule out anyone whose notes or history say pull-back on similar work. Otherwise null.\n' +
    '- "category": for delegate-able tasks, the single best fit from the Task categories list, or null if none fits (null for founder-only items).\n' +
    '- "mentioned_people": names of people EXPLICITLY stated in this chunk who are not already in ' +
    "the Team list above — max 5. Never infer or guess who a task might involve; only names " +
    "actually said.\n" +
    '- "explicit_deadline": a deadline literally stated in this chunk (e.g. "by 2pm", "before ' +
    'Friday"), verbatim, or null. Never infer urgency that wasn\'t stated.\n' +
    '- "stated_reason": a short quote if a reason or motive was explicitly given in this chunk, or ' +
    "null. Never infer a motive that wasn't said.\n\n" +
    "Reply with ONLY a raw JSON array, no markdown fences, one object per chunk — a single-chunk " +
    'capture is still an array of length 1: [{"text":"...","business":...,"project":...,' +
    '"is_leverage":...,"summary":"...","suggested_owner_id":...,"category":...,' +
    '"mentioned_people":[...],"explicit_deadline":...,"stated_reason":...}]'
  );
}

function parseChunk(value: unknown, ctx: ClassifyContext, fallbackText: string): Chunk | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;

  const text = typeof c.text === "string" && c.text.trim() ? c.text.trim() : fallbackText;
  const business =
    typeof c.business === "string" && ctx.businesses.some((b) => b.name === c.business)
      ? (c.business as string)
      : null;
  const businessId = business ? (ctx.businesses.find((b) => b.name === business)?.id ?? null) : null;
  const isPersonalProject = businessId
    ? ctx.businessProjectType[businessId] === "personal_project"
    : false;
  // personal_project businesses never have anyone to delegate to — enforced
  // in code, not just prompt wording, since the model's output is untrusted.
  const is_leverage = isPersonalProject
    ? true
    : typeof c.is_leverage === "boolean"
      ? c.is_leverage
      : null;
  const summary = typeof c.summary === "string" && c.summary.trim() ? c.summary.trim() : text;
  const suggested_owner_id =
    is_leverage === false &&
    typeof c.suggested_owner_id === "string" &&
    ctx.people.some((person) => person.id === c.suggested_owner_id)
      ? (c.suggested_owner_id as string)
      : null;
  const category =
    typeof c.category === "string" && ctx.categories.some((cat) => cat.name === c.category)
      ? (c.category as string)
      : null;
  const existingNames = new Set(ctx.people.map((p) => p.name.toLowerCase()));
  const mentioned_people = Array.isArray(c.mentioned_people)
    ? Array.from(
        new Set(
          c.mentioned_people.filter(
            (s): s is string => typeof s === "string" && Boolean(s.trim()),
          ),
        ),
      )
        .filter((name) => !existingNames.has(name.toLowerCase()))
        .slice(0, 5)
    : [];
  const explicit_deadline =
    typeof c.explicit_deadline === "string" && c.explicit_deadline.trim()
      ? c.explicit_deadline.trim()
      : null;
  const stated_reason =
    typeof c.stated_reason === "string" && c.stated_reason.trim() ? c.stated_reason.trim() : null;

  return {
    text,
    business,
    project: typeof c.project === "string" && c.project.trim() ? c.project.trim() : null,
    is_leverage,
    summary,
    suggested_owner_id,
    category,
    mentioned_people,
    explicit_deadline,
    stated_reason,
  };
}

export async function classifyCapture(text: string, ctx: ClassifyContext): Promise<Chunk[]> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY server-side
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096, // an array of chunks, each echoing its own text verbatim
    messages: [{ role: "user", content: buildPrompt(text, ctx) }],
  });
  if (response.stop_reason === "max_tokens") {
    throw new Error("classifier output truncated at max_tokens");
  }

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  const parsed: unknown = JSON.parse(raw);
  const rawChunks = Array.isArray(parsed) ? parsed : [parsed]; // tolerate a bare object too
  const chunks = rawChunks
    .map((c) => parseChunk(c, ctx, text))
    .filter((c): c is Chunk => c !== null)
    .slice(0, MAX_CHUNKS);

  // Nothing usable came back — fail safe to one whole-text, unclassified
  // chunk, the same "never lose a thought" guarantee as before chunking.
  if (!chunks.length) {
    return [
      {
        text,
        business: null,
        project: null,
        is_leverage: null,
        summary: text,
        suggested_owner_id: null,
        category: null,
        mentioned_people: [],
        explicit_deadline: null,
        stated_reason: null,
      },
    ];
  }
  return chunks;
}
