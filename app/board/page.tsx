import BoardClient from "@/components/board/BoardClient";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type {
  BoardEntry,
  Business,
  BusinessSettings,
  ChecklistItem,
  Delegation,
  Entry,
  Person,
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
  ] = await Promise.all([
    db.from("entries").select("*").order("captured_at", { ascending: false }),
    db.from("businesses").select("*").order("created_at"),
    db.from("people").select("*").order("created_at"),
    db.from("projects").select("*"),
    db.from("delegations").select("*").order("assigned_at", { ascending: false }),
    db.from("checklist_items").select("*").order("sort_order"),
    db.from("business_settings").select("business_id, project_type"),
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

  const board: BoardEntry[] = entries.map((e) => {
    // Delegations are sorted newest-first: the first match is the current or
    // most recent owner; only an unresolved one is "open" (assignable state).
    const latest = delegations.find((d) => d.entry_id === e.id) ?? null;
    const open = latest && !latest.resolved_at ? latest : null;
    return {
      id: e.id,
      text: e.text,
      summary: e.summary ?? e.text,
      businessId: e.business_id,
      businessName: e.business_id ? (businessName.get(e.business_id) ?? null) : null,
      projectId: e.project_id,
      projectName: e.project_id ? (projectName.get(e.project_id) ?? null) : null,
      isLeverage: e.is_leverage,
      done: e.status === "done",
      suggestedPersonId: e.suggested_person_id,
      capturedAt: e.captured_at,
      ownerId: latest?.person_id ?? null,
      openDelegationId: open?.id ?? null,
      tier2Status: e.tier2_status,
      tier2Reason: e.tier2_reason,
      checklist: checklistItems
        .filter((c) => c.entry_id === e.id)
        .map((c) => ({ id: c.id, text: c.text, done: c.done })),
      category: e.category,
      parkedUntil: e.parked_until,
      mentionedPeople: e.mentioned_people,
    };
  });

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

  return (
    <BoardClient
      initialEntries={board}
      businesses={businesses}
      businessProjectType={businessProjectType}
      people={people}
      evidence={evidence}
      newId={newId ?? null}
    />
  );
}
