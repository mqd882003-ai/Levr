import SettingsClient from "@/components/settings/SettingsClient";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { AppSettings, Business } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: AppSettings = {
  id: true,
  user_name: "David",
  notifications_enabled: true,
  slack_enabled: false,
};

export default async function SettingsPage() {
  if (!supabaseConfigured()) {
    return (
      <section className="screen" aria-label="Settings">
        <div className="topbar">
          <h1>Settings</h1>
        </div>
        <div className="settings">
          <div className="empty">
            <b>Backend isn&apos;t configured.</b>
            Fill in .env.local and restart the dev server.
          </div>
        </div>
      </section>
    );
  }

  const db = supabaseServer();
  const [settingsRes, businessesRes] = await Promise.all([
    db.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>(),
    db.from("businesses").select("*").order("created_at"),
  ]);

  return (
    <SettingsClient
      initialSettings={settingsRes.data ?? DEFAULT_SETTINGS}
      initialBusinesses={(businessesRes.data ?? []) as Business[]}
    />
  );
}
