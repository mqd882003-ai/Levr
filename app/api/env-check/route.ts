import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY deploy diagnostic — reports whether each env var reaches the
// running function. Exposes only booleans, lengths, and the constant key-type
// prefix (e.g. "sb_secret"), never values. Delete once the deploy is healthy.
const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export async function GET() {
  const report: Record<string, unknown> = {};
  for (const name of VARS) {
    const raw = process.env[name];
    if (raw === undefined) {
      report[name] = { set: false };
      continue;
    }
    report[name] = {
      set: true,
      length: raw.length,
      // Whitespace/newline smuggled in by copy-paste shows up as a mismatch.
      trimmedLength: raw.trim().length,
      // URL host is not a secret; for keys this reveals only the type prefix.
      prefix: raw.slice(0, name === "NEXT_PUBLIC_SUPABASE_URL" ? 30 : 9),
      isPlaceholder: raw.includes("REPLACE_ME"),
      hasQuotes: raw.startsWith('"') || raw.startsWith("'"),
    };
  }
  return NextResponse.json({
    supabaseConfigured: supabaseConfigured(),
    vars: report,
  });
}
