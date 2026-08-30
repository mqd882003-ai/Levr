import BoardClient from "@/components/board/BoardClient";
import { toBoardEntries } from "@/lib/boardEntries";
import type { RoutingSnapshot } from "@/lib/routing";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type {
  BoardEntry,
  Business,
  BusinessSettings,
  Category,
  ChecklistItem,
  Delegation,
  Entry,
  Person,
  PersonCategoryRating,
  Project,
  ProjectType,
  TrustEvidence,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: newId } = await searchParams;

  if (!supabaseConfigured()) {
    return (
      <section className="screen" aria-label="Board">
        <div className="topbar">
          <h1>Board</h1>
        </div>
        <div className="section">
          <div className="empty">
            <b>Backend isn&apos;t configured.</b>
            Fill in .env.local and restart the dev server.
          </div>
        </div>
      </section>
    );
  }

  const db = supabaseServer();
  const [
    entriesRes,
    businessesRes,
    peopleRes,
    projectsRes,
    delegationsRes,
    checklistRes,
    businessSettingsRes,
    categoriesRes,
    ratingsRes,
  ] = await Promise.all([
    db.from("entries").select("*").order("captured_at", { ascending: false }),
    db.from("businesses").select("*").order("created_at"),
    db.from("people").select("*").order("created_at"),
    db.from("projects").select("*"),
    db.from("delegations").select("*").order("assigned_at", { ascending: false }),
    db.from("checklist_items").select("*").order("sort_order"),
    db.from("business_settings").select("business_id, project_type"),
    db.from("categories").select("*"),
    db.from("person_category_ratings").select("*"),
  ]);

  const entries = (entriesRes.data ?? []) as Entry[];
  const businesses = (businessesRes.data ?? []) as Business[];
  const people = (peopleRes.data ?? []) as Person[];
  const projects = (projectsRes.data ?? []) as Project[];
  const delegations = (delegationsRes.data ?? []) as Delegation[];
  const checklistItems = (checklistRes.data ?? []) as ChecklistItem[];
  const businessSettings = (businessSettingsRes.data ?? []) as Pick<
    BusinessSettings,
    "business_id" | "project_type"
  >[];
  // HANDOFF task 4: entries under a personal_project business (3D Scan,
  // Backtesting) never have anyone to delegate to — Board/EntrySheet use this
  // to hide the assign-owner affordance for them.
  const businessProjectType: Record<string, ProjectType> = {};
  for (const bs of businessSettings) businessProjectType[bs.business_id] = bs.project_type;

  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const board: BoardEntry[] = toBoardEntries(
    entries,
    delegations,
    checklistItems,
    businessName,
    projectName,
  );

  // A3: slim resolved rows for the assignment sheet's per-category trust read.
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

  // Routing junction (stage 3): the signals AssignSheet ranks from, built
  // from data this page already loads. Same "N active" definition as the
  // Team card: open delegation on an entry that is still open.
  const openEntryIds = new Set(entries.filter((e) => e.status === "open").map((e) => e.id));
  const activeCounts: Record<string, number> = {};
  for (const d of delegations) {
    if (d.person_id && !d.resolved_at && openEntryIds.has(d.entry_id)) {
      activeCounts[d.person_id] = (activeCounts[d.person_id] ?? 0) + 1;
    }
  }
  const routingSnap: RoutingSnapshot = {
    people,
    evidence,
    activeCounts,
    categories: (categoriesRes.data ?? []) as Category[],
    ratings: (ratingsRes.data ?? []) as PersonCategoryRating[],
  };

  return (
    <BoardClient
      initialEntries={board}
      businesses={businesses}
      businessProjectType={businessProjectType}
      people={people}
      evidence={evidence}
      routingSnap={routingSnap}
      newId={newId ?? null}
    />
  );
}
