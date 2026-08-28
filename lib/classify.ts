import Anthropic from "@anthropic-ai/sdk";
import type { Business, Category, Person, Project, ProjectType } from "@/lib/types";

// Per docs/levr-requirements.md § Classification backend: short structured-output
// task, pinned to Haiku 4.5. Do not upgrade without a concrete accuracy reason.
// CLASSIFY_MODEL_OVERRIDE exists ONLY for the Haiku-vs-Sonnet segmentation test
// Dave asked for — set it in .env.local to compare, then unset it. It must
// never be relied on in production; the pin above is still the real default.
const MODEL = process.env.CLASSIFY_MODEL_OVERRIDE || "claude-haiku-4-5-20251001";
const MAX_CHUNKS = 25;

export interface ClassifyContext {
  businesses: Business[];
  businessProjectType: Record<string, ProjectType>;
  projects: Project[];
  people: Person[];
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
  }));

  return (
    "You are sorting a busy entrepreneur's raw thought into structured data.\n\n" +
    "Businesses (with project_type — a 'personal_project' business has no one to delegate to, " +
    "so is_leverage is always true there, no judgment needed): " + JSON.stringify(businesses) +
    "\nExisting projects: " + JSON.stringify(projectNames) +
    "\nTeam (with capability notes): " + JSON.stringify(team) +
    "\nTask categories: " + JSON.stringify(ctx.categories.map((c) => c.name)) +
    "\n\nCaptured entry: " + JSON.stringify(text) +
    "\n\nStep 1 — enumerate concerns. A capture may contain any number of distinct concerns, " +
    "from one to a dozen. A separate concern is marked by a change in business, person, " +
    "deliverable, or purpose — not by length; a long capture can still be one concern, and a " +
    "short one can hold three. List each concern you find as a short label in the `concerns` " +
    "array, in the order it was spoken, before doing anything else.\n\n" +
    "Step 2 — for EACH concern from Step 1, produce one object in `chunks`, in the same order, " +
    "deciding:\n" +
    '- "text": the full original text of just this chunk, verbatim, no length limit and never ' +
    "shortened — the record of what was actually said.\n" +
    '- "business": exactly one name from the Businesses list, based ONLY on (a) THIS chunk\'s own ' +
    "text naming or clearly implying it, or (b) a team member explicitly named in THIS chunk " +
    "whose business affiliation is known from the Team list above. Never infer from nearby " +
    "chunks or the capture's overall topic — judge this chunk in isolation. Null if neither (a) " +
    "nor (b) applies. It is better to return null than to guess.\n" +
    '- "business_evidence": the short literal quote from THIS chunk\'s own text that justifies the ' +
    '"business" value under case (a), OR the team member\'s name that justifies it under case (b). ' +
    'Null whenever "business" is null.\n' +
    '- "project": an existing project name it belongs to (fuzzy match), or a short NEW 2-4 word project name if it clearly starts one, or null.\n' +
    '- "is_leverage": true if this is founder-only work (strategy, judgment, key relationships, pricing, hiring); false if operational/repeatable work someone else could do; ' +
    "ALWAYS true when the business's project_type is personal_project; null only if genuinely impossible to tell.\n" +
    '- "summary": this chunk compressed to one board-readable line, max 12 words.\n' +
    '- "category": for delegate-able tasks, the single best fit from the Task categories list, or null if none fits (null for founder-only items).\n' +
    '- "mentioned_people": names of people EXPLICITLY stated in this chunk who could plausibly be ' +
    "asked to do work — never a lead, customer, vendor, tenant, or other external party the task " +
    "concerns (e.g. 'follow up with the Smith lead' names Smith as the SUBJECT of work, not a " +
    "candidate to add to Team). Not already in the Team list above — max 5. Never infer or guess; " +
    "only names actually said, and only when it's plausible they're someone Dave would delegate " +
    "to.\n" +
    '- "explicit_deadline": a deadline literally stated in this chunk (e.g. "by 2pm", "before ' +
    'Friday"), verbatim, or null. Never infer urgency that wasn\'t stated.\n' +
    '- "stated_reason": a short quote if a reason or motive was explicitly given in this chunk, or ' +
    "null. Never infer a motive that wasn't said.\n\n" +
    "Call the classify_capture tool with your concerns list and chunks array. A single-concern " +
    "capture is still valid — concerns and chunks will just each have length 1."
  );
}

// Forces structured output instead of hoping Haiku's free-text reply happens to
// be valid JSON (item 4 of the segmentation fix: prompt-only JSON is a coin
// flip). `concerns` is listed before `chunks` in the schema so the model
// enumerates concerns as a distinct reasoning step before filling `chunks`,
// which is what actually unblocks segmentation (item 2) — the neutral framing
// in the prompt text alone wasn't enough on its own in earlier testing.
const CLASSIFY_TOOL = {
  name: "classify_capture",
  description:
    "Segment a raw capture into its distinct concerns, then classify each one into structured fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      concerns: {
        type: "array",
        description:
          "Short one-line labels, one per distinct concern found in the capture, in the order spoken. Length only, not a reason to split further.",
        items: { type: "string" },
      },
      chunks: {
        type: "array",
        description: "One object per entry in `concerns`, same order, same length.",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            business: { type: ["string", "null"] },
            business_evidence: { type: ["string", "null"] },
            project: { type: ["string", "null"] },
            is_leverage: { type: ["boolean", "null"] },
            summary: { type: "string" },
            category: { type: ["string", "null"] },
            mentioned_people: { type: "array", items: { type: "string" } },
            explicit_deadline: { type: ["string", "null"] },
            stated_reason: { type: ["string", "null"] },
          },
          required: ["text", "summary"],
        },
      },
    },
    required: ["concerns", "chunks"],
  },
};

function parseChunk(value: unknown, ctx: ClassifyContext, fallbackText: string): Chunk | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;

  const text = typeof c.text === "string" && c.text.trim() ? c.text.trim() : fallbackText;
  const businessClaim =
    typeof c.business === "string" && ctx.businesses.some((b) => b.name === c.business)
      ? (c.business as string)
      : null;
  const businessClaimId = businessClaim
    ? (ctx.businesses.find((b) => b.name === businessClaim)?.id ?? null)
    : null;
  const businessEvidenceRaw =
    typeof c.business_evidence === "string" ? c.business_evidence.trim() : "";
  // Don't trust a business claim on the model's say-so — it has been observed
  // both omitting evidence and inventing plausible-sounding evidence
  // ("postcard context", a bare "that") that doesn't actually appear in the
  // chunk or name a real team member. Verify the evidence, don't just check
  // it's present.
  const businessEvidenceValid =
    businessEvidenceRaw.length > 0 &&
    (text.toLowerCase().includes(businessEvidenceRaw.toLowerCase()) ||
      ctx.people.some(
        (p) =>
          p.business_id === businessClaimId &&
          p.name.toLowerCase() === businessEvidenceRaw.toLowerCase(),
      ));
  const business = businessClaim && businessEvidenceValid ? businessClaim : null;
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
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_capture" },
    messages: [{ role: "user", content: buildPrompt(text, ctx) }],
  });

  // Item 1 of the segmentation-fix plan: log ground truth before any parsing
  // touches it, so a bad split is debuggable from what the model actually
  // said instead of inferred from the saved rows. TEMPORARY — strip or gate
  // behind a debug flag once segmentation is confirmed reliable; this will
  // otherwise log full capture text (personal data) to server logs forever.
  console.log("[classify] model=%s raw_response=%s", MODEL, JSON.stringify(response));

  if (response.stop_reason === "max_tokens") {
    throw new Error("classifier output truncated at max_tokens");
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "classify_capture",
  );
  if (!toolUse) {
    throw new Error(
      "model did not call classify_capture (stop_reason=" + response.stop_reason + ")",
    );
  }

  const input = toolUse.input as { concerns?: unknown; chunks?: unknown };
  const concerns = Array.isArray(input.concerns) ? input.concerns : [];
  const rawChunks = Array.isArray(input.chunks) ? input.chunks : [];

  // Make truncation visible the moment it happens, not discovered later by
  // counting board entries against what the founder actually said.
  if (concerns.length > MAX_CHUNKS) {
    const dropped = concerns.slice(MAX_CHUNKS);
    console.warn(
      "[classify] TRUNCATED: model returned %d concerns but MAX_CHUNKS=%d — dropping %d: %s",
      concerns.length,
      MAX_CHUNKS,
      dropped.length,
      JSON.stringify(dropped),
    );
  }

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
        category: null,
        mentioned_people: [],
        explicit_deadline: null,
        stated_reason: null,
      },
    ];
  }
  return chunks;
}
