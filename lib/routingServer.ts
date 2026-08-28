import { recommendFromSnapshot, type RoutingResult, type RoutingSnapshot } from "@/lib/routing";
import { supabaseServer } from "@/lib/supabase/server";
import type { Category, Delegation, Person, PersonCategoryRating, TrustEvidence } from "@/lib/types";

// Server half of the routing junction: loads the signals lib/routing.ts ranks
// from. Split from the pure core (same pattern as trust.ts) so client
// components can import rankOwners/recommendFromSnapshot without dragging the
// service-role Supabase client into the browser bundle.

export async function loadRoutingSnapshot(): Promise<RoutingSnapshot> {
  const db = supabaseServer();
  const [peopleRes, delegationsRes, entriesRes, categoriesRes, ratingsRes] = await Promise.all([
    db.from("people").select("*").order("created_at"),
    db.from("delegations").select("*"),
    db.from("entries").select("id, status").eq("status", "open"),
    db.from("categories").select("*"),
    db.from("person_category_ratings").select("*"),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  if (delegationsRes.error) throw new Error(delegationsRes.error.message);
  if (entriesRes.error) throw new Error(entriesRes.error.message);
  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  if (ratingsRes.error) throw new Error(ratingsRes.error.message);

  const delegations = (delegationsRes.data ?? []) as Delegation[];

  // Same "N active" definition as the Team card: open delegation on an
  // entry that is still open.
  const openEntryIds = new Set(((entriesRes.data ?? []) as { id: string }[]).map((e) => e.id));
  const activeCounts: Record<string, number> = {};
  for (const d of delegations) {
    if (d.person_id && !d.resolved_at && openEntryIds.has(d.entry_id)) {
      activeCounts[d.person_id] = (activeCounts[d.person_id] ?? 0) + 1;
    }
  }

  // Same slim evidence rows the board page builds for the assignment sheet.
  const evidence: TrustEvidence[] = delegations
    .filter((d) => d.resolved_at && d.person_id)
    .map((d) => ({
      person_id: d.person_id as string,
      category: d.category,
      resolved_at: d.resolved_at as string,
      actual_outcome: d.actual_outcome,
      verdict: d.verdict,
      diagnosis: d.diagnosis,
      expected_outcome: d.expected_outcome,
    }));

  return {
    people: (peopleRes.data ?? []) as Person[],
    evidence,
    activeCounts,
    categories: (categoriesRes.data ?? []) as Category[],
    ratings: (ratingsRes.data ?? []) as PersonCategoryRating[],
  };
}

// DB loader — the one seam callers use (Tier 1/Tier 2 after they write
// category + business_id, AssignSheet's server side). Read-only; writing the
// routing_recommendations row happens where a suggestion is actually shown.
export async function recommendOwner(
  entryId: string,
  businessId: string | null,
  category: string | null,
): Promise<RoutingResult> {
  return recommendFromSnapshot(await loadRoutingSnapshot(), entryId, businessId, category);
}
