// Client-safe parsing of entries.intent_payload (012). Kept separate from
// lib/intent.ts, which imports the Anthropic SDK and must stay server-only.

export interface IntentPayload {
  aliasText?: string; // the name as said in the capture
  note?: string; // person_note: the observation text
  personName?: string; // resolved roster name
  taskText?: string; // outcome_report: the delegation's expected outcome
  candidates?: Array<{ id: string; name: string }>; // ambiguous person match
  reply?: string; // consult: the opening answer
}

export function parseIntentPayload(raw: string | null): IntentPayload {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as IntentPayload;
  } catch {
    return {};
  }
}
