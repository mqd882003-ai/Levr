import Anthropic from "@anthropic-ai/sdk";
import { PERSONA } from "@/lib/tier2";
import type { Business, CaptureIntent, Person, PersonAlias } from "@/lib/types";

// Intent router Step 1 (intent-router-handoff §2): before Tier 2 spends the
// full pipeline on a capture, decide what KIND of thing it is. Two gates, one
// call: Gate 1 (plain task vs special) demands a literal snippet from the
// text as proof — same pattern as classify.ts's business_evidence guard; no
// verified snippet, no exception, falls through to 'task'. Gate 2 picks which
// special kind.
const MODEL = "claude-sonnet-5";

const SPECIAL_INTENTS = new Set(["person_note", "outcome_report", "consult", "decision"]);

export interface IntentGateResult {
  intent: CaptureIntent;
  evidence: string | null; // verified literal snippet, null for 'task'
  personName: string | null; // as said in the text (person_note / outcome_report)
}

export const TASK_INTENT: IntentGateResult = {
  intent: "task",
  evidence: null,
  personName: null,
};

// All dynamic text embedded via JSON.stringify (requirements §Known failure mode).
export function buildIntentGatePrompt(
  text: string,
  people: Pick<Person, "name" | "role">[],
  businesses: Pick<Business, "name">[],
): string {
  return (
    "A busy founder just captured a raw thought. Before it gets classified as a task, decide " +
    "what KIND of thing it actually is. The default is 'task' — anything actionable, however " +
    "vague. Only route away from 'task' when the text plainly is one of the special kinds " +
    "below.\n\n" +
    "Team roster: " + JSON.stringify(people.map((p) => ({ name: p.name, role: p.role ?? "" }))) +
    "\nBusinesses: " + JSON.stringify(businesses.map((b) => b.name)) +
    "\n\nCaptured entry: " + JSON.stringify(text) +
    "\n\nGATE 1 — plain task/capture, or special? To answer 'special' you MUST quote a short " +
    "literal snippet from the entry text — the exact words that make it special. If no snippet " +
    "in the text itself proves it, it is a plain task and you stop there.\n\n" +
    "GATE 2 — which special kind (only if Gate 1 found evidence):\n" +
    "- person_note: an observation about a ROSTER team member's ability, reliability, or " +
    "progress — evaluative language about the person, with nothing to do. " +
    "(\"Yana's still shaky on inventory ordering\")\n" +
    "- outcome_report: narrating that something already handed to a ROSTER person is now " +
    "finished or resolved — completed-result language, past tense, nothing new to do. " +
    "(\"Danny closed the Smith deal, finally\")\n" +
    "- consult: a question aimed at YOU, the assistant — asking for reasoning or advice, not " +
    "filing work for anyone. (\"Should I raise her hours or hire a second tech?\")\n" +
    "- decision: a call the founder has already made — declarative, no task in it, no " +
    "question. (\"We're not taking new small accounts anymore\")\n\n" +
    "Hard rules:\n" +
    "- A person named inside a to-do is still a task (\"Call Yana about the zirconia order\" " +
    "is a task, not a person_note).\n" +
    "- Mixed content — a task plus a comment, a report plus a follow-up — is a task.\n" +
    "- person_note and outcome_report require the person to be on the roster above; put the " +
    "name AS SAID IN THE TEXT in person_name.\n" +
    "- Torn between two kinds, or unsure at all: task.\n\n" +
    "Call the route_intent tool with your answer."
  );
}

// Structured output, same rationale as classify.ts: prompt-only JSON is a
// coin flip; the tool schema also forces the evidence field to exist before
// the model can claim 'special'.
const INTENT_TOOL = {
  name: "route_intent",
  description:
    "Route a captured thought: plain task, or one of four special intents (with literal evidence).",
  input_schema: {
    type: "object" as const,
    properties: {
      special: {
        type: "boolean",
        description: "Gate 1: true only when a literal snippet in the text proves a special kind.",
      },
      evidence: {
        type: ["string", "null"],
        description:
          "The short literal snippet from the entry text that proves 'special'. Null when special is false.",
      },
      intent: {
        type: "string",
        enum: ["task", "person_note", "outcome_report", "consult", "decision"],
        description: "Gate 2: the kind. 'task' whenever special is false.",
      },
      person_name: {
        type: ["string", "null"],
        description:
          "For person_note / outcome_report: the roster person's name as said in the text. Null otherwise.",
      },
    },
    required: ["special", "intent"],
  },
};

// The model's claim is untrusted — verify the evidence snippet actually
// appears in the text (case-insensitive) before honoring a special intent.
export function parseIntentGate(input: unknown, text: string): IntentGateResult {
  if (typeof input !== "object" || input === null) return TASK_INTENT;
  const p = input as Record<string, unknown>;
  const intent = typeof p.intent === "string" ? p.intent : "task";
  if (p.special !== true || !SPECIAL_INTENTS.has(intent)) return TASK_INTENT;
  const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
  if (!evidence || !text.toLowerCase().includes(evidence.toLowerCase())) return TASK_INTENT;
  const personName =
    typeof p.person_name === "string" && p.person_name.trim() ? p.person_name.trim() : null;
  // These two intents are meaningless without a person to hang them on.
  if ((intent === "person_note" || intent === "outcome_report") && !personName) {
    return TASK_INTENT;
  }
  return { intent: intent as CaptureIntent, evidence, personName };
}

export async function runIntentGate(
  text: string,
  people: Pick<Person, "name" | "role">[],
  businesses: Pick<Business, "name">[],
): Promise<IntentGateResult> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000, // Sonnet thinks adaptively; thinking spends max_tokens
    system: PERSONA,
    tools: [INTENT_TOOL],
    tool_choice: { type: "tool", name: "route_intent" },
    messages: [{ role: "user", content: buildIntentGatePrompt(text, people, businesses) }],
  });
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "route_intent",
  );
  if (!toolUse) return TASK_INTENT;
  return parseIntentGate(toolUse.input, text);
}

// ---------- person resolution (Gap 2) ----------

// Candidates for "who is this about": direct roster matches (exact name or
// first-name, case-insensitive) plus confirmed aliases. An alias is only a
// candidate, never an auto-answer — the ask-don't-guess rule and the caller's
// exactly-one check re-verify it against the live roster every time, so a
// stored shortcut can't silently drift wrong later (§4).
export function resolvePersonCandidates(
  name: string,
  people: Person[],
  aliases: PersonAlias[],
): Person[] {
  const needle = name.trim().toLowerCase();
  if (!needle) return [];
  const ids = new Set<string>();
  const out: Person[] = [];
  const add = (p: Person | undefined) => {
    if (p && !ids.has(p.id)) {
      ids.add(p.id);
      out.push(p);
    }
  };
  for (const p of people) {
    const full = p.name.trim().toLowerCase();
    const first = full.split(/\s+/)[0];
    if (full === needle || first === needle) add(p);
  }
  for (const a of aliases) {
    if (a.alias_text.trim().toLowerCase() === needle) {
      add(people.find((p) => p.id === a.person_id));
    }
  }
  return out;
}
