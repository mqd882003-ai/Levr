import TeamClient from "@/components/team/TeamClient";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { AppSettings, Business, Delegation, Entry, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  if (!supabaseConfigured()) {
    return (
      <section className="screen" aria-label="Team">
        <div className="topbar">
          <h1>Team</h1>
        </div>
        <div className="team">
          <div className="empty">
            <b>Backend isn&apos;t configured.</b>
            Fill in .env.local and restart the dev server.
          </div>
        </div>
      </section>
    );
  }

  const db = supabaseServer();
  const [peopleRes, businessesRes, delegationsRes, entriesRes, settingsRes] =
    await Promise.all([
      db.from("people").select("*").order("created_at"),
      db.from("businesses").select("*").order("created_at"),
      db.from("delegations").select("*").order("assigned_at", { ascending: false }),
      db.from("entries").select("id, status"),
      db.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>(),
    ]);

  const people = (peopleRes.data ?? []) as Person[];
  const businesses = (businessesRes.data ?? []) as Business[];
  const delegations = (delegationsRes.data ?? []) as Delegation[];
  const entries = (entriesRes.data ?? []) as Pick<Entry, "id" | "status">[];

  // "N active" = open delegations whose entry is still open.
  const openEntryIds = new Set(entries.filter((e) => e.status === "open").map((e) => e.id));
  const activeCounts: Record<string, number> = {};
  for (const d of delegations) {
    if (d.person_id && !d.resolved_at && openEntryIds.has(d.entry_id)) {
      activeCounts[d.person_id] = (activeCounts[d.person_id] ?? 0) + 1;
    }
  }

  return (
    <TeamClient
      initialPeople={people}
      businesses={businesses}
      delegations={delegations}
      activeCounts={activeCounts}
      slackEnabled={settingsRes.data?.slack_enabled ?? false}
    />
  );
}
