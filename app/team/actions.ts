"use server";

import { supabaseServer } from "@/lib/supabase/server";
import type { Channel, Person } from "@/lib/types";

export interface PersonInput {
  name: string;
  role: string;
  businessId: string | null;
  phone: string;
  email: string;
  channel: Channel;
  notes: string;
}

export async function savePerson(
  id: string | null,
  input: PersonInput,
): Promise<{ ok: boolean; error?: string; person?: Person }> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required" };
    const row = {
      name,
      role: input.role.trim() || null,
      business_id: input.businessId,
      phone_number: input.phone.trim() || null,
      email: input.email.trim() || null,
      preferred_channel: input.channel,
      capability_notes: input.notes.trim(),
    };
    const db = supabaseServer();
    const res = id
      ? await db.from("people").update(row).eq("id", id).select().single<Person>()
      : await db.from("people").insert(row).select().single<Person>();
    if (res.error || !res.data) throw new Error(res.error?.message ?? "No row returned");
    return { ok: true, person: res.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// Person rows are deleted outright; delegations keep their history rows with
// person_id set NULL (schema FK), and their open entries become unassigned.
export async function deletePerson(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const res = await db.from("people").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}
