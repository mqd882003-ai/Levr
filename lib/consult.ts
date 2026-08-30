import Anthropic from "@anthropic-ai/sdk";
import { PERSONA } from "@/lib/persona";
import type { Tier2Context } from "@/lib/tier2";

// Consult intent (intent-router-handoff §4, Gap 5): a reasoning/advice
// question answered conversationally. THE ASSISTANT ADVISES, IT NEVER DECIDES
// — nothing here concludes, summarizes, or files anything on Dave's behalf.
// The conversation is ephemeral by design: turns live in the client while the
// screen is open and are never persisted.
const MODEL = "claude-sonnet-5";

const CONSULT_RULES =
  "\n\nYou are in a live back-and-forth consult. Hard rules:\n" +
  "- Advise, never decide. Never announce a conclusion on his behalf, never say you'll file, " +
  "log, or set up anything — you have no ability to, and nothing from this conversation is " +
  "saved anywhere.\n" +
  "- Short, direct answers: 1-4 sentences. Talk like a sharp advisor over the shoulder, not a " +
  "report. No headers, no bullet lists unless he asks.\n" +
  "- When one concrete fact would change the answer, ask for it instead of hedging both ways.";

export interface ConsultTurn {
  role: "user" | "assistant";
  text: string;
}

function buildContextBlock(ctx: Tier2Context): string {
  const businessName = new Map(ctx.businesses.map((b) => [b.id, b.name]));
  const team = ctx.people.map((p) => ({
    name: p.name,
    role: p.role ?? "",
    business: p.business_id ? (businessName.get(p.business_id) ?? null) : null,
    capability_notes: p.capability_notes || "",
  }));
  const openDelegations = ctx.delegations
    .filter((d) => !d.resolved_at)
    .map((d) => ({
      person: ctx.people.find((p) => p.id === d.person_id)?.name ?? null,
      task: d.expected_outcome,
    }));
  return (
    "Businesses: " + JSON.stringify(ctx.businesses.map((b) => b.name)) +
    "\nTeam (capability notes): " + JSON.stringify(team) +
    "\nCurrently delegated and open: " + JSON.stringify(openDelegations)
  );
}

// One reply in the consult conversation. turns is the whole conversation so
// far EXCLUDING the opening question (which is the entry text itself) —
// empty for the first reply Tier 2 generates. ctx is passed in (not loaded
// here) to keep this module free of a runtime cycle with lib/tier2.ts.
export async function consultReply(
  question: string,
  turns: ConsultTurn[],
  ctx: Tier2Context,
): Promise<string> {
  const client = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        buildContextBlock(ctx) +
        "\n\nThe founder just asked you, in his own words: " +
        JSON.stringify(question),
    },
    ...turns.map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000, // Sonnet thinks adaptively; thinking spends max_tokens
    system: PERSONA + CONSULT_RULES,
    messages,
  });
  if (response.stop_reason === "max_tokens") {
    throw new Error("consult reply truncated at max_tokens");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("consult reply came back empty");
  return text;
}
