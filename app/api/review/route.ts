import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { PERSONA, loadTier2Context } from "@/lib/tier2";
import type { Entry } from "@/lib/types";

export const runtime = "nodejs";

// Phase 2 §5: on-demand audit mode. User-initiated only; may ask up to 3
// clarifying questions (only here, never during capture); returns per-entry
// suggestions the user applies or dismisses individually.
const MODEL = "claude-sonnet-5";

interface ReviewRequest {
  businessId?: string | null;
  qa?: Array<{ question: string; answer: string }>;
}

export interface ReviewSuggestion {
  entryId: string;
  entrySummary: string;
  field: "is_leverage" | "business" | "project";
  to: string; // "20%" | "delegate" for is_leverage; a name otherwise
  changeLabel: string;
  reason: string;
}

export async function POST(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }
  let body: ReviewRequest;
  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const businessId = typeof body.businessId === "string" ? body.businessId : null;
  const qa = Array.isArray(body.qa) ? body.qa.slice(0, 3) : null;

  try {
    const db = supabaseServer();
    const ctx = await loadTier2Context();
    const scopeName = businessId
      ? (ctx.businesses.find((b) => b.id === businessId)?.name ?? null)
      : null;

    let query = db.from("entries").select("*").eq("status", "open");
    if (businessId) query = query.eq("business_id", businessId);
    const entriesRes = await query.order("captured_at", { ascending: false }).limit(40);
    const entries = (entriesRes.data ?? []) as Entry[];
    if (!entries.length) {
      return NextResponse.json({ suggestions: [] });
    }

    const businessName = new Map(ctx.businesses.map((b) => [b.id, b.name]));
    const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
    const openOwners = new Map(
      ctx.delegations
        .filter((d) => !d.resolved_at && d.person_id)
        .map((d) => [d.entry_id, d.person_id as string]),
    );
    const board = entries.map((e) => ({
      entry_id: e.id,
      text: e.text,
      summary: e.summary,
      business: e.business_id ? (businessName.get(e.business_id) ?? null) : null,
      project: e.project_id ? (projectName.get(e.project_id) ?? null) : null,
      is_leverage: e.is_leverage,
      owner: openOwners.has(e.id)
        ? (ctx.people.find((p) => p.id === openOwners.get(e.id))?.name ?? null)
        : null,
    }));
    const team = ctx.people.map((p) => ({
      name: p.name,
      role: p.role,
      capability_notes: p.capability_notes,
    }));
    const corrections = ctx.corrections.map((c) => ({
      field: c.field,
      entry: c.entry_text,
      from: c.from_value,
      to: c.to_value,
    }));

    const prompt =
      "The founder asked you to review their current board" +
      (scopeName ? " for " + JSON.stringify(scopeName) : " across all businesses") +
      " and flag what should change.\n\n" +
      "Businesses: " + JSON.stringify(ctx.businesses.map((b) => b.name)) +
      "\nTeam: " + JSON.stringify(team) +
      "\nPast corrections by the founder: " + JSON.stringify(corrections) +
      "\nOpen board items: " + JSON.stringify(board) +
      (qa
        ? "\n\nYou asked clarifying questions; here are the answers: " +
          JSON.stringify(qa) +
          "\nDo NOT ask further questions — give your assessment now."
        : "\n\nIf (and only if) you genuinely need clarification before assessing, reply " +
          'with ONLY {"questions": ["...", ...]} (max 3, specific, answerable in a line). ' +
          "Otherwise skip questions entirely.") +
      "\n\nAssessment format — reply with ONLY raw JSON, no markdown fences:\n" +
      '{"suggestions": [{"entry_id": "...", "field": "is_leverage"|"business"|"project", ' +
      '"to": "20%"|"delegate" (for is_leverage) or a name, "reason": "one line"}]}\n' +
      "Only include items you would actually change (empty list is a fine answer). " +
      "Max 6 suggestions, most important first. Never suggest a business not in the list.";

    const client = new Anthropic();
    // Adaptive thinking spends from max_tokens — budget generously so the
    // JSON never truncates mid-string.
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 10000,
      system: PERSONA,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "max_tokens") {
      throw new Error("Model output truncated — try again");
    }
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(raw) as {
      questions?: unknown;
      suggestions?: unknown;
    };

    if (!qa && Array.isArray(parsed.questions) && parsed.questions.length) {
      const questions = parsed.questions
        .filter((q): q is string => typeof q === "string" && Boolean(q.trim()))
        .slice(0, 3);
      if (questions.length) return NextResponse.json({ questions });
    }

    const entryById = new Map(entries.map((e) => [e.id, e]));
    const suggestions: ReviewSuggestion[] = (
      Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    )
      .flatMap((s: unknown): ReviewSuggestion[] => {
        if (typeof s !== "object" || s === null) return [];
        const sug = s as Record<string, unknown>;
        const entry = typeof sug.entry_id === "string" ? entryById.get(sug.entry_id) : null;
        const field = sug.field;
        const to = typeof sug.to === "string" ? sug.to.trim() : "";
        const reason = typeof sug.reason === "string" ? sug.reason.trim() : "";
        if (!entry || !to || !reason) return [];
        if (field === "is_leverage") {
          if (to !== "20%" && to !== "delegate") return [];
          const from = entry.is_leverage === true ? "Your 20%" : entry.is_leverage === false ? "Delegated" : "Unsorted";
          const target = to === "20%" ? "Your 20%" : "Delegated";
          if (from === target) return [];
          return [{
            entryId: entry.id,
            entrySummary: entry.summary ?? entry.text,
            field: "is_leverage" as const,
            to,
            changeLabel: `${from} → ${target}`,
            reason,
          }];
        }
        if (field === "business") {
          if (!ctx.businesses.some((b) => b.name === to)) return [];
          const from = entry.business_id ? (businessName.get(entry.business_id) ?? "None") : "None";
          if (from === to) return [];
          return [{
            entryId: entry.id,
            entrySummary: entry.summary ?? entry.text,
            field: "business" as const,
            to,
            changeLabel: `${from} → ${to}`,
            reason,
          }];
        }
        if (field === "project") {
          const from = entry.project_id ? (projectName.get(entry.project_id) ?? "None") : "None";
          if (from.toLowerCase() === to.toLowerCase()) return [];
          return [{
            entryId: entry.id,
            entrySummary: entry.summary ?? entry.text,
            field: "project" as const,
            to,
            changeLabel: `${from} → ${to}`,
            reason,
          }];
        }
        return [];
      })
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("review failed:", err);
    return NextResponse.json(
      {
        error: "Couldn't finish the review — try again.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
