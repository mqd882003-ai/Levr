"use server";

import { notifyAssignment } from "@/lib/notify";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  ChecklistItem,
  CorrectionField,
  Delegation,
  Entry,
  Outcome,
  Person,
  Project,
  Verdict,
} from "@/lib/types";

// Phase 2 §4: corrections are recorded, not just applied — they feed Tier 2.
async function logCorrections(
  entry: Entry,
  changes: Array<{ field: CorrectionField; from: string | null; to: string | null }>,
) {
  if (!changes.length) return;
  const db = supabaseServer();
  await db.from("corrections").insert(
    changes.map((c) => ({
      entry_id: entry.id,
      field: c.field,
      from_value: c.from,
      to_value: c.to,
      entry_text: entry.text,
    })),
  );
}

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
  // Outcome of the single assignment message (only on new assignments).
  notification?: {
    sent: boolean;
    channel: string | null;
    skipped?: "notifications_off";
    error?: string;
  };
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

    // Snapshot the pre-edit state so user corrections can be logged.
    const beforeRes = await db
      .from("entries")
      .select("*")
      .eq("id", input.id)
      .maybeSingle<Entry>();
    const before = beforeRes.data;

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

    const classificationChanged = Boolean(
      before &&
        (before.business_id !== input.businessId ||
          before.project_id !== projectId ||
          before.is_leverage !== input.isLeverage),
    );
    const updated = await db
      .from("entries")
      .update({
        summary: summary || null,
        business_id: input.businessId,
        project_id: projectId,
        is_leverage: input.isLeverage,
        // A user edit resolves any pending Tier 2 disagreement.
        ...(classificationChanged ? { tier2_status: null, tier2_reason: null } : {}),
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
    let notification: SaveEntryResult["notification"];
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
      // The one automatic trigger in the whole app: this explicit assignment.
      // A failed send never blocks the assignment (spec §Delegation notifications).
      notification = await notifyAssignment(inserted.data.id);
    }

    // Record what the user changed vs. the pre-edit state (Phase 2 §4).
    if (before) {
      const [bizRows, projRows, peopleRows] = await Promise.all([
        db.from("businesses").select("id, name").then((r) => r.data ?? []),
        db.from("projects").select("id, name").then((r) => r.data ?? []),
        db.from("people").select("id, name").then((r) => r.data ?? []),
      ]);
      const nameOf = (rows: Array<{ id: string; name: string }>, id: string | null) =>
        id ? (rows.find((r) => r.id === id)?.name ?? id) : null;
      const levLabel = (v: boolean | null) =>
        v === true ? "20%" : v === false ? "delegate" : "unsure";
      const priorOwnerId = open.data?.person_id ?? null;

      const changes: Array<{ field: CorrectionField; from: string | null; to: string | null }> =
        [];
      if (before.business_id !== input.businessId)
        changes.push({
          field: "business",
          from: nameOf(bizRows, before.business_id),
          to: nameOf(bizRows, input.businessId),
        });
      if (before.project_id !== projectId)
        changes.push({
          field: "project",
          from: nameOf(projRows, before.project_id),
          to: finalProjectName,
        });
      if (before.is_leverage !== input.isLeverage)
        changes.push({
          field: "is_leverage",
          from: levLabel(before.is_leverage),
          to: levLabel(input.isLeverage),
        });
      if (priorOwnerId !== ownerId)
        changes.push({
          field: "owner",
          from: nameOf(peopleRows, priorOwnerId) ?? "unassigned",
          to: nameOf(peopleRows, ownerId) ?? "unassigned",
        });
      await logCorrections(before, changes);
    }

    return {
      ok: true,
      projectId,
      projectName: finalProjectName,
      ownerId,
      openDelegationId,
      assignedName,
      notification,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// ---------- Phase 2: checklist actions ----------

export async function addChecklistItem(
  entryId: string,
  text: string,
): Promise<{ ok: boolean; error?: string; item?: ChecklistItem }> {
  try {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: "Text is required" };
    const db = supabaseServer();
    const max = await db
      .from("checklist_items")
      .select("sort_order")
      .eq("entry_id", entryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    const res = await db
      .from("checklist_items")
      .insert({ entry_id: entryId, text: trimmed, sort_order: (max.data?.sort_order ?? -1) + 1 })
      .select()
      .single<ChecklistItem>();
    if (res.error || !res.data) throw new Error(res.error?.message ?? "No row returned");
    return { ok: true, item: res.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Add failed" };
  }
}

export async function toggleChecklistItem(
  id: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const res = await db.from("checklist_items").update({ done }).eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function deleteChecklistItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = supabaseServer();
    const res = await db.from("checklist_items").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
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

// Phase 2 §5: apply one accepted "Review with me" suggestion. Each apply is a
// deliberate user action; nothing on Board changes automatically.
export async function applyReviewSuggestion(
  entryId: string,
  field: "is_leverage" | "business" | "project",
  to: string,
): Promise<{
  ok: boolean;
  error?: string;
  patch?: {
    isLeverage?: boolean;
    businessId?: string | null;
    businessName?: string | null;
    projectId?: string | null;
    projectName?: string | null;
  };
}> {
  try {
    const db = supabaseServer();
    if (field === "is_leverage") {
      const isLeverage = to === "20%";
      const res = await db
        .from("entries")
        .update({ is_leverage: isLeverage, tier2_status: null, tier2_reason: null })
        .eq("id", entryId);
      if (res.error) throw new Error(res.error.message);
      return { ok: true, patch: { isLeverage } };
    }
    if (field === "business") {
      const biz = await db
        .from("businesses")
        .select("id, name")
        .eq("name", to)
        .maybeSingle<{ id: string; name: string }>();
      if (!biz.data) return { ok: false, error: "Unknown business" };
      const res = await db
        .from("entries")
        .update({ business_id: biz.data.id, tier2_status: null, tier2_reason: null })
        .eq("id", entryId);
      if (res.error) throw new Error(res.error.message);
      return { ok: true, patch: { businessId: biz.data.id, businessName: biz.data.name } };
    }
    // project: match existing (case-insensitive) or create
    const existing = await db
      .from("projects")
      .select("*")
      .ilike("name", to)
      .limit(1)
      .maybeSingle<Project>();
    let project = existing.data ?? null;
    if (!project) {
      const created = await db
        .from("projects")
        .insert({ name: to, created_from_entry_id: entryId })
        .select()
        .single<Project>();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "insert failed");
      project = created.data;
    }
    const res = await db
      .from("entries")
      .update({ project_id: project.id })
      .eq("id", entryId);
    if (res.error) throw new Error(res.error.message);
    return { ok: true, patch: { projectId: project.id, projectName: project.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Apply failed" };
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
