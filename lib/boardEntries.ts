import type { BoardEntry, ChecklistItem, Delegation, Entry } from "@/lib/types";

// Shared entries -> BoardEntry flattening used by both Board and Calendar
// (calendar-phase1-handoff §1: same view model, same EntrySheet).
export function toBoardEntries(
  entries: Entry[],
  delegations: Delegation[],
  checklistItems: ChecklistItem[],
  businessName: Map<string, string>,
  projectName: Map<string, string>,
): BoardEntry[] {
  return entries.map((e) => {
    // Delegations are sorted newest-first: the first match is the current or
    // most recent owner; only an unresolved one is "open" (assignable state).
    const latest = delegations.find((d) => d.entry_id === e.id) ?? null;
    const open = latest && !latest.resolved_at ? latest : null;
    return {
      id: e.id,
      text: e.text,
      summary: e.summary ?? e.text,
      businessId: e.business_id,
      businessName: e.business_id ? (businessName.get(e.business_id) ?? null) : null,
      projectId: e.project_id,
      projectName: e.project_id ? (projectName.get(e.project_id) ?? null) : null,
      isLeverage: e.is_leverage,
      done: e.status === "done",
      suggestedPersonId: e.suggested_person_id,
      capturedAt: e.captured_at,
      ownerId: latest?.person_id ?? null,
      openDelegationId: open?.id ?? null,
      tier2Status: e.tier2_status,
      tier2Reason: e.tier2_reason,
      checklist: checklistItems
        .filter((c) => c.entry_id === e.id)
        .map((c) => ({ id: c.id, text: c.text, done: c.done })),
      category: e.category,
      parkedUntil: e.parked_until,
      mentionedPeople: e.mentioned_people,
      captureIntent: e.capture_intent ?? "task",
      intentStatus: e.intent_status,
      intentPersonId: e.intent_person_id,
      intentDelegationId: e.intent_delegation_id,
      intentPayload: e.intent_payload,
      deadlineAt: e.deadline_at,
      deadlineAllDay: e.deadline_all_day,
      explicitDeadline: e.explicit_deadline,
    };
  });
}
