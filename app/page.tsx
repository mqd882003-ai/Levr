import CaptureBox from "@/components/capture/CaptureBox";
import Greeting from "@/components/capture/Greeting";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getUserName(): Promise<string> {
  if (!supabaseConfigured()) return "David";
  try {
    const db = supabaseServer();
    const { data } = await db
      .from("app_settings")
      .select("user_name")
      .eq("id", true)
      .single<{ user_name: string }>();
    return data?.user_name || "David";
  } catch {
    return "David";
  }
}

// For the post-capture question queue's business chips (requirements
// §Interaction model rule-3 exception). Empty list just disables business
// questions — capture itself never depends on this.
async function getBusinesses(): Promise<{ id: string; name: string }[]> {
  if (!supabaseConfigured()) return [];
  try {
    const db = supabaseServer();
    const { data } = await db
      .from("businesses")
      .select("id, name")
      .order("created_at");
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [name, businesses] = await Promise.all([getUserName(), getBusinesses()]);
  return (
    <section className="screen screen-home" aria-label="Home">
      <div className="home-inner">
        <Greeting name={name} />
        <CaptureBox businesses={businesses} />
      </div>
    </section>
  );
}
