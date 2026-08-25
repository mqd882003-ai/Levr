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

export default async function HomePage() {
  const name = await getUserName();
  return (
    <section className="screen screen-home" aria-label="Home">
      <div className="home-inner">
        <Greeting name={name} />
        <CaptureBox />
      </div>
    </section>
  );
}
