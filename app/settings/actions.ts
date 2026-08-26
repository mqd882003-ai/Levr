"use server";

import { supabaseServer } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

export async function updateSettings(patch: {
  userName?: string;
  notifications?: boolean;
  slack?: boolean;
  autoNotes?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const row: Record<string, unknown> = {};
    if (patch.userName !== undefined) row.user_name = patch.userName.trim() || "there";
    if (patch.notifications !== undefined) row.notifications_enabled = patch.notifications;
    if (patch.slack !== undefined) row.slack_enabled = patch.slack;
    if (patch.autoNotes !== undefined) row.auto_notes = patch.autoNotes;
    const db = supabaseServer();
    const res = await db.from("app_settings").update(row).eq("id", true);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function addBusiness(
  name: string,
): Promise<{ ok: boolean; error?: string; business?: Business }> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Name is required" };
    const db = supabaseServer();
    const res = await db
      .from("businesses")
      .insert({ name: trimmed })
      .select()
      .single<Business>();
    if (res.error || !res.data) {
      if (res.error?.code === "23505") return { ok: false, error: "That business already exists" };
      throw new Error(res.error?.message ?? "No row returned");
    }
    return { ok: true, business: res.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Add failed" };
  }
}

// Entries/people/projects referencing the business keep their rows —
// business_id just goes null (FK on delete set null).
export async function removeBusiness(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const res = await db.from("businesses").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Remove failed" };
  }
}

// Full workspace reset (prototype parity): wipes entries, projects,
// delegations, and people; reseeds the two default businesses; keeps settings.
export async function clearAllData(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    // Delete children before parents (delegations cascade from entries anyway).
    for (const table of ["delegations", "entries", "projects", "people", "businesses"]) {
      const res = await db.from(table).delete().not("id", "is", null);
      if (res.error) throw new Error(`${table}: ${res.error.message}`);
    }
    const seed = await db
      .from("businesses")
      .insert([{ name: "True Home Acquisitions" }, { name: "TC Dental Lab" }]);
    if (seed.error) throw new Error(seed.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Reset failed" };
  }
}
