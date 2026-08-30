import { redirect } from "next/navigation";
import AskClient from "@/components/ask/AskClient";
import { parseIntentPayload } from "@/lib/intentPayload";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { Business, Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

// Full-screen consult conversation (intent-router-handoff §4, Gap 5).
// Ephemeral: the opening question and first reply come from the entry row;
// every later turn lives only in the client while this screen is open.
export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const [{ id }, { auto }] = await Promise.all([params, searchParams]);
  if (!supabaseConfigured()) redirect("/board");

  const db = supabaseServer();
  const entryRes = await db
    .from("entries")
    .select("*")
    .eq("id", id)
    .maybeSingle<Entry>();
  const entry = entryRes.data;
  if (!entry || entry.capture_intent !== "consult") redirect("/board");

  let businessName: string | null = null;
  if (entry.business_id) {
    const biz = await db
      .from("businesses")
      .select("name")
      .eq("id", entry.business_id)
      .maybeSingle<Pick<Business, "name">>();
    businessName = biz.data?.name ?? null;
  }
  const payload = parseIntentPayload(entry.intent_payload);

  return (
    <AskClient
      entryId={entry.id}
      question={entry.text}
      businessName={businessName}
      initialReply={payload.reply ?? null}
      autoOpened={auto === "1"}
    />
  );
}
