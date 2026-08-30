import CalendarClient from "@/components/calendar/CalendarClient";
import { toBoardEntries } from "@/lib/boardEntries";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type {
  Business,
  BusinessSettings,
  ChecklistItem,
  Delegation,
  Entry,
  PersonalSettings,
  Person,
  Project,
  ProjectType,
  TrustEvidence,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Week view (v1 — Day toggle stubbed). Fetches every open entry that has any
// deadline signal (dated or not) plus the protected-window rules; the client
// component pages weeks locally, so flipping weeks never refetches. Fine at
// personal scale — revisit the fetch-all if entries with deadlines ever
// number in the hundreds.
export default async function CalendarPage() {
  if (!supabaseConfigured()) {
    return (
      <section className="screen" aria-label="Calendar">
        <div className="topbar">
          <h1>Calendar</h1>
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
    settingsRes,
    businessesRes,
    peopleRes,
    projectsRes,
    delegationsRes,
    checklistRes,
    businessSettingsRes,
  ] = await Promise.all([
    db
      .from("entries")
      .select("*")
      .eq("status", "open")
      .not("explicit_deadline", "is", null)
      .order("deadline_at", { ascending: true, nullsFirst: false }),
    db.from("personal_settings").select("*").eq("id", true).maybeSingle<PersonalSettings>(),
    db.from("businesses").select("*").order("created_at"),
    db.from("people").select("*").order("created_at"),
    db.from("projects").select("*"),
    db.from("delegations").select("*").order("assigned_at", { ascending: false }),
    db.from("checklist_items").select("*").order("sort_order"),
    db.from("business_settings").select("business_id, project_type"),
  ]);

  const entries = (entriesRes.data ?? []) as Entry[];
  const windows = settingsRes.data?.protected_windows ?? [];
  const businesses = (businessesRes.data ?? []) as Business[];
  const people = (peopleRes.data ?? []) as Person[];
  const projects = (projectsRes.data ?? []) as Project[];
  const delegations = (delegationsRes.data ?? []) as Delegation[];
  const checklistItems = (checklistRes.data ?? []) as ChecklistItem[];
  const businessSettings = (businessSettingsRes.data ?? []) as Pick<
    BusinessSettings,
    "business_id" | "project_type"
  >[];
  const businessProjectType: Record<string, ProjectType> = {};
  for (const bs of businessSettings) businessProjectType[bs.business_id] = bs.project_type;

  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const boardEntries = toBoardEntries(entries, delegations, checklistItems, businessName, projectName);

  // A3: slim resolved rows for EntrySheet's per-category trust read — same
  // shape Board builds, scoped to this same delegations fetch.
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
    <CalendarClient
      entries={boardEntries}
      windows={windows}
      businesses={businesses}
      businessProjectType={businessProjectType}
      people={people}
      evidence={evidence}
    />
  );
}
