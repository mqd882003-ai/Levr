import CalendarClient from "@/components/calendar/CalendarClient";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { Business, Entry, PersonalSettings } from "@/lib/types";

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
  const [entriesRes, settingsRes, businessesRes] = await Promise.all([
    db
      .from("entries")
      .select("*")
      .eq("status", "open")
      .not("explicit_deadline", "is", null)
      .order("deadline_at", { ascending: true, nullsFirst: false }),
    db.from("personal_settings").select("*").eq("id", true).maybeSingle<PersonalSettings>(),
    db.from("businesses").select("*").order("created_at"),
  ]);

  const entries = (entriesRes.data ?? []) as Entry[];
  const windows = settingsRes.data?.protected_windows ?? [];
  const businesses = (businessesRes.data ?? []) as Business[];

  return (
    <CalendarClient
      entries={entries}
      windows={windows}
      businessNames={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
    />
  );
}
