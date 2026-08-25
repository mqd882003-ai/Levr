"use server";

import { supabaseServer } from "@/lib/supabase/server";
import type { Delegation, Outcome, Person, Project, Verdict } from "@/lib/types";

interface SaveEntryInput {
  id: string;
  summary: string;
  businessId: string | null;
  projectName: string;
  isLeverage: boolean | null;
  ownerId: string | null;
}

export interface SaveEntryResult {
  ok: boolean;
  error?: string;
  projectId?: string | null;
  projectName?: string | null;
  ownerId?: string | null;
  openDelegationId?: string | null;
  assignedName?: string | null; // set only when a NEW assignment was created
}

// Persists an entry-sheet edit. Owner changes maintain the delegations table:
// a new assignment inserts an open delegation (expected_outcome = the task
// line at assignment time); removing/changing an owner deletes the never-
// resolved open delegation — resolved history rows are never touched.
export async function saveEntry(input: SaveEntryInput): Promise<SaveEntryResult> {
  try {
    const db = supabaseServer();
    const summary = input.summary.trim();
    const projectName = input.projectName.trim();
    const desiredOwner = input.isLeverage === false ? input.ownerId : null;

    // Resolve or create the project.
    let projectId: string | null = null;
    let finalProjectName: string | null = null;
    if (projectName) {
      const found = await db
        .from("projects")
        .select("*")
        .ilike("name", projectName)
        .limit(1)
        .maybeSingle<Project>();
      if (found.data) {
        projectId = found.data.id;
        finalProjectName = found.data.name;
      } else {
        const created = await db
          .from("projects")
          .insert({
            name: projectName,
            business_id: input.businessId,
            created_from_entry_id: input.id,
          })
          .select()
          .single<Project>();
        if (created.error) throw new Error(created.error.message);
        projectId = created.data.id;
        finalProjectName = created.data.name;
      }
    }

    const updated = await db
      .from("entries")
      .update({
        summary: summary || null,
        business_id: input.businessId,
        project_id: projectId,
        is_leverage: input.isLeverage,
      })
      .eq("id", input.id);
    if (updated.error) throw new Error(updated.error.message);

    // Reconcile the open delegation with the desired owner.
    const open = await db
      .from("delegations")
      .select("*")
      .eq("entry_id", input.id)
      .is("resolved_at", null)
      .maybeSingle<Delegation>();
    let openDelegationId = open.data?.id ?? null;
    let ownerId = open.data?.person_id ?? null;
    let assignedName: string | null = null;

    if (open.data && open.data.person_id !== desiredOwner) {
      await db.from("delegations").delete().eq("id", open.data.id);
      openDelegationId = null;
      ownerId = null;
    }
    if (desiredOwner && ownerId !== desiredOwner) {
      const inserted = await db
        .from("delegations")
        .insert({
          entry_id: input.id,
          person_id: desiredOwner,
          expected_outcome: summary || null,
        })
        .select()
        .single<Delegation>();
      if (inserted.error) throw new Error(inserted.error.message);
      openDelegationId = inserted.data.id;
      ownerId = desiredOwner;
      const person = await db
        .from("people")
        .select("name")
        .eq("id", desiredOwner)
        .single<Pick<Person, "name">>();
      assignedName = person.data?.name ?? null;
    }

    return {
      ok: true,
      projectId,
      projectName: finalProjectName,
      ownerId,
      openDelegationId,
      assignedName,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export interface ToggleDoneResult {
  ok: boolean;
  error?: string;
  // Present when a just-completed entry has an open delegation to close out.
  closeout?: { delegationId: string; personName: string; taskText: string } | null;
}

export async function toggleDone(id: string, done: boolean): Promise<ToggleDoneResult> {
  try {
    const db = supabaseServer();
    const updated = await db
      .from("entries")
      .update({ status: done ? "done" : "open", done_at: done ? new Date().toISOString() : null })
      .eq("id", id);
    if (updated.error) throw new Error(updated.error.message);

    if (!done) return { ok: true, closeout: null };
    const open = await db
      .from("delegations")
      .select("id, person_id, expected_outcome")
      .eq("entry_id", id)
      .is("resolved_at", null)
      .maybeSingle<{ id: string; person_id: string | null; expected_outcome: string | null }>();
    if (!open.data || !open.data.person_id) return { ok: true, closeout: null };
    const person = await db
      .from("people")
      .select("name")
      .eq("id", open.data.person_id)
      .single<Pick<Person, "name">>();
    return {
      ok: true,
      closeout: {
        delegationId: open.data.id,
        personName: person.data?.name ?? "Someone",
        taskText: open.data.expected_outcome ?? "",
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function closeoutDelegation(
  delegationId: string,
  outcome: Outcome,
  verdict: Verdict | null,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const updated = await db
      .from("delegations")
      .update({
        actual_outcome: outcome,
        verdict,
        outcome_note: note.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", delegationId);
    if (updated.error) throw new Error(updated.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function deleteEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const deleted = await db.from("entries").delete().eq("id", id);
    if (deleted.error) throw new Error(deleted.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}
