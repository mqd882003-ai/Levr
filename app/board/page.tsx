import BoardClient from "@/components/board/BoardClient";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type {
  BoardEntry,
  Business,
  Delegation,
  Entry,
  Person,
  Project,
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
  const [entriesRes, businessesRes, peopleRes, projectsRes, delegationsRes] =
    await Promise.all([
      db.from("entries").select("*").order("captured_at", { ascending: false }),
      db.from("businesses").select("*").order("created_at"),
      db.from("people").select("*").order("created_at"),
      db.from("projects").select("*"),
      db.from("delegations").select("*").order("assigned_at", { ascending: false }),
    ]);

  const entries = (entriesRes.data ?? []) as Entry[];
  const businesses = (businessesRes.data ?? []) as Business[];
  const people = (peopleRes.data ?? []) as Person[];
  const projects = (projectsRes.data ?? []) as Project[];
  const delegations = (delegationsRes.data ?? []) as Delegation[];

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
    };
  });

  return (
    <BoardClient
      initialEntries={board}
      businesses={businesses}
      people={people}
      newId={newId ?? null}
    />
  );
}
