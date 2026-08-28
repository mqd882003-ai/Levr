"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recommendFromSnapshot, type RoutingSnapshot } from "@/lib/routing";
import {
  applyReviewSuggestion,
  closeoutDelegation,
  deleteEntry,
  parkEntry,
  saveEntry,
  toggleDone,
} from "@/app/board/actions";
import type { ReviewSuggestion } from "@/app/api/review/route";
import ReviewSheet from "@/components/sheets/ReviewSheet";
import BoardSection from "@/components/board/BoardSection";
import DoneDrawer from "@/components/board/DoneDrawer";
import PulseBar from "@/components/board/PulseBar";
import ScopeChips from "@/components/board/ScopeChips";
import CaptureBox from "@/components/capture/CaptureBox";
import Sheet, { SheetHead } from "@/components/sheets/Sheet";
import AssignSheet from "@/components/sheets/AssignSheet";
import CloseoutSheet, { type CloseoutTarget } from "@/components/sheets/CloseoutSheet";
import EntrySheet, { type EntrySheetSave } from "@/components/sheets/EntrySheet";
import Toast, { type ToastState } from "@/components/ui/Toast";
import type { CapturedExtras } from "@/components/capture/CaptureBox";
import type {
  BoardEntry,
  Business,
  Diagnosis,
  Entry,
  Outcome,
  Person,
  ProjectType,
  TrustEvidence,
  Verdict,
} from "@/lib/types";

export default function BoardClient({
  initialEntries,
  businesses,
  businessProjectType,
  people,
  evidence,
  routingSnap,
  newId,
}: {
  initialEntries: BoardEntry[];
  businesses: Business[];
  businessProjectType: Record<string, ProjectType>;
  people: Person[];
  evidence: TrustEvidence[];
  routingSnap: RoutingSnapshot;
  newId: string | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  // A1: people can grow mid-session via inline create-and-assign.
  const [peopleList, setPeopleList] = useState(people);
  const [scope, setScope] = useState("all");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardEntry | null>(null);
  const [closeout, setCloseout] = useState<CloseoutTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Gesture round: the row whose long-press (or badge-flip-to-Delegate)
  // opened the assign sheet.
  const [assigning, setAssigning] = useState<BoardEntry | null>(null);
  // Routing junction (stage 3): rank owners for the entry being assigned.
  // peopleList overrides the snapshot's people so someone inline-created
  // mid-session still shows up (as an unknown-baseline row).
  const assignRouting = useMemo(
    () =>
      assigning
        ? recommendFromSnapshot(
            { ...routingSnap, people: peopleList },
            assigning.id,
            assigning.businessId,
            assigning.category,
          )
        : null,
    [assigning, peopleList, routingSnap],
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string, kind?: ToastState["kind"]) => {
    setToast({ msg, kind, key: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Server data is the source of truth after any navigation (including the
  // quick-add flow pushing /board?new=…, which refetches the page).
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);
  useEffect(() => {
    setPeopleList(people);
  }, [people]);

  // Fresh capture: flash + scroll to the new row, announce the filing, clean
  // the URL (requirements §Home: "visibly highlighted at the top ... for a
  // few seconds").
  useEffect(() => {
    if (!newId) return;
    setQuickAdd(false);
    const entry = initialEntries.find((e) => e.id === newId);
    if (entry) {
      setFlashId(newId);
      showToast(
        entry.isLeverage === true
          ? "Filed under Your 20%"
          : entry.isLeverage === false
            ? "Filed under Delegated"
            : "Needs a quick look",
        entry.isLeverage === true ? "signal" : entry.isLeverage === false ? "noise" : "bad",
      );
      requestAnimationFrame(() => {
        document
          .getElementById(`row-${newId}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      setTimeout(() => setFlashId(null), 2200);
    }
    router.replace("/board", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newId]);

  const patchEntry = (id: string, patch: Partial<BoardEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const announceFiling = useCallback(
    (isLeverage: boolean | null) => {
      showToast(
        isLeverage === true
          ? "Filed under Your 20%"
          : isLeverage === false
            ? "Filed under Delegated"
            : "Needs a quick look",
        isLeverage === true ? "signal" : isLeverage === false ? "noise" : "bad",
      );
    },
    [showToast],
  );

  // Quick-add lands the classified entry straight into the list — no
  // navigation, no skeleton flash (the whole board "disappearing" for a
  // beat was the old behavior's refetch).
  const handleQuickCapture = (entry: Entry, extras: CapturedExtras) => {
    const row: BoardEntry = {
      id: entry.id,
      text: entry.text,
      summary: entry.summary ?? entry.text,
      businessId: entry.business_id,
      businessName: extras.businessName,
      projectId: entry.project_id,
      projectName: extras.projectName,
      isLeverage: entry.is_leverage,
      done: false,
      suggestedPersonId: entry.suggested_person_id,
      capturedAt: entry.captured_at,
      ownerId: null,
      openDelegationId: null,
      tier2Status: entry.tier2_status,
      tier2Reason: entry.tier2_reason,
      checklist: [],
      category: entry.category,
      parkedUntil: entry.parked_until,
      mentionedPeople: entry.mentioned_people,
    };
    setEntries((prev) => [row, ...prev]);
    setQuickAdd(false);
    if (row.businessId && scope !== "all" && scope !== row.businessId) setScope("all");
    setFlashId(row.id);
    announceFiling(row.isLeverage);
    requestAnimationFrame(() => {
      document.getElementById(`row-${row.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setTimeout(() => setFlashId(null), 2200);
  };

  const handleToggleDone = async (entry: BoardEntry) => {
    const done = !entry.done;
    patchEntry(entry.id, { done });
    const res = await toggleDone(entry.id, done);
    if (!res.ok) {
      patchEntry(entry.id, { done: entry.done });
      showToast("Couldn't save that — try again", "bad");
      return;
    }
    if (res.closeout) setCloseout(res.closeout);
  };

  const handleSave = async (input: EntrySheetSave) => {
    if (!editing) return;
    setSaving(true);
    const res = await saveEntry({ id: editing.id, ...input });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Save failed", "bad");
      return;
    }
    patchEntry(editing.id, {
      summary: input.summary,
      businessId: input.businessId,
      businessName: businesses.find((b) => b.id === input.businessId)?.name ?? null,
      projectId: res.projectId ?? null,
      projectName: res.projectName ?? null,
      isLeverage: input.isLeverage,
      ownerId: res.ownerId ?? null,
      openDelegationId: res.openDelegationId ?? null,
    });
    setEditing(null);
    if (res.createdPerson) {
      setPeopleList((prev) => [...prev, res.createdPerson!]);
    }
    if (res.assignedName) {
      const n = res.notification;
      if (n?.sent) {
        showToast(`Sent to ${res.assignedName} via ${(n.channel ?? "").toUpperCase()}`, "good");
      } else if (n?.skipped === "no_contact") {
        showToast(`Assigned to ${res.assignedName} (no contact info yet)`, "good");
      } else if (n?.skipped === "notifications_off") {
        showToast(`Assigned to ${res.assignedName}`, "good");
      } else {
        showToast(`Assigned to ${res.assignedName} — message didn't send`, "bad");
      }
    } else showToast("Saved");
  };

  // Gesture round (board-gestures-handoff.md): assign from the long-press
  // sheet. Reuses saveEntry so every existing side effect fires — delegation
  // row, notification with quiet-skips, correction logging, A1 create-on-
  // the-fly. Assigning someone is inherently delegating, so isLeverage
  // always lands false here.
  const handleAssign = async (pick: { ownerId?: string; newOwnerName?: string }) => {
    if (!assigning || saving) return;
    const entry = assigning;
    setSaving(true);
    const res = await saveEntry({
      id: entry.id,
      summary: entry.summary,
      businessId: entry.businessId,
      projectName: entry.projectName ?? "",
      isLeverage: false,
      ownerId: pick.ownerId ?? null,
      newOwnerName: pick.newOwnerName,
    });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't assign that", "bad");
      return;
    }
    patchEntry(entry.id, {
      isLeverage: false,
      ownerId: res.ownerId ?? null,
      openDelegationId: res.openDelegationId ?? null,
      projectId: res.projectId ?? null,
      projectName: res.projectName ?? null,
    });
    setAssigning(null);
    if (res.createdPerson) setPeopleList((prev) => [...prev, res.createdPerson!]);
    if (res.assignedName) {
      const n = res.notification;
      if (n?.sent) {
        showToast(`Assigned to ${res.assignedName} — sent via ${(n.channel ?? "").toUpperCase()}`, "good");
      } else if (n?.skipped === "no_contact") {
        showToast(`Assigned to ${res.assignedName} (no contact info yet)`, "good");
      } else if (n?.skipped === "notifications_off") {
        showToast(`Assigned to ${res.assignedName}`, "good");
      } else {
        showToast(`Assigned to ${res.assignedName} — message didn't send`, "bad");
      }
    } else showToast("Saved");
  };

  // Badge tap: flip Your 20% ↔ Delegate in place. Goes through saveEntry so
  // the flip is correction-logged exactly like an entry-sheet edit (human
  // override = Tier 2 signal). Flipping TO Delegate opens the assign sheet
  // right after — switching implies you're about to pick someone.
  const handleToggleType = async (entry: BoardEntry) => {
    if (saving) return;
    const toLev = entry.isLeverage !== true;
    setSaving(true);
    const res = await saveEntry({
      id: entry.id,
      summary: entry.summary,
      businessId: entry.businessId,
      projectName: entry.projectName ?? "",
      isLeverage: toLev,
      ownerId: toLev ? null : (entry.ownerId ?? null),
    });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't switch that", "bad");
      return;
    }
    const patch = {
      isLeverage: toLev,
      ownerId: res.ownerId ?? null,
      openDelegationId: res.openDelegationId ?? null,
    };
    patchEntry(entry.id, patch);
    if (toLev) {
      showToast("Switched to Your 20%");
    } else {
      showToast("Switched to Delegate — pick someone");
      const updated = { ...entry, ...patch };
      setTimeout(() => setAssigning(updated), 350);
    }
  };

  // personal_project businesses have no one to delegate to — same rule that
  // hides the EntrySheet toggle; the badge renders static for them.
  const isTypeToggleable = (e: BoardEntry) =>
    !(e.businessId && businessProjectType[e.businessId] === "personal_project");

  // Shared by the swipe-left Delete button and the sheet's trash action.
  const handleDeleteEntry = async (entry: BoardEntry): Promise<boolean> => {
    const res = await deleteEntry(entry.id);
    if (!res.ok) {
      showToast(res.error ?? "Delete failed", "bad");
      return false;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setEditing((cur) => (cur?.id === entry.id ? null : cur));
    showToast("Deleted");
    return true;
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    await handleDeleteEntry(editing);
    setSaving(false);
  };

  const handleReviewApply = async (s: ReviewSuggestion): Promise<boolean> => {
    const res = await applyReviewSuggestion(s.entryId, s.field, s.to);
    if (!res.ok || !res.patch) {
      showToast(res.error ?? "Couldn't apply that", "bad");
      return false;
    }
    patchEntry(s.entryId, {
      ...(res.patch.isLeverage !== undefined
        ? { isLeverage: res.patch.isLeverage, tier2Status: null, tier2Reason: null }
        : {}),
      ...(res.patch.businessId !== undefined
        ? {
            businessId: res.patch.businessId,
            businessName: res.patch.businessName ?? null,
            tier2Status: null,
            tier2Reason: null,
          }
        : {}),
      ...(res.patch.projectId !== undefined
        ? { projectId: res.patch.projectId, projectName: res.patch.projectName ?? null }
        : {}),
    });
    showToast("Applied", "good");
    return true;
  };

  const handlePark = async () => {
    if (!editing) return;
    const id = editing.id;
    const res = await parkEntry(id);
    if (!res.ok || !res.parkedUntil) {
      showToast(res.error ?? "Couldn't park that", "bad");
      return;
    }
    patchEntry(id, { parkedUntil: res.parkedUntil });
    setEditing(null);
    showToast("Parked — I'll bring it back in a couple weeks");
  };

  const handleCloseoutLog = async (
    outcome: Outcome,
    verdict: Verdict | null,
    note: string,
    diagnosis: Diagnosis | null,
  ) => {
    if (!closeout) return;
    setSaving(true);
    const res = await closeoutDelegation(
      closeout.delegationId,
      outcome,
      verdict,
      note,
      diagnosis,
    );
    setSaving(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't log that", "bad");
      return;
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.openDelegationId === closeout.delegationId
          ? { ...e, openDelegationId: null }
          : e,
      ),
    );
    setCloseout(null);
    showToast("Logged to their history", "good");
  };

  const scoped = entries.filter((e) => scope === "all" || e.businessId === scope);
  const lev = scoped.filter((e) => e.isLeverage === true && !e.done);
  const del = scoped.filter((e) => e.isLeverage === false && !e.done);
  const rev = scoped.filter((e) => e.isLeverage === null && !e.done);
  const done = scoped.filter((e) => e.done);
  const openCount = lev.length + del.length + rev.length;

  const counts = new Map<string, number>();
  counts.set("all", entries.filter((e) => !e.done).length);
  for (const b of businesses) {
    counts.set(b.id, entries.filter((e) => e.businessId === b.id && !e.done).length);
  }

  return (
    <section className="screen" aria-label="Board">
      <div className="topbar">
        <h1>Board</h1>
        <div className="topbar-right">
          <button
            type="button"
            className="search-icon pressable"
            aria-label="Search — coming soon"
            onClick={() => showToast("Search is coming soon")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <span className="meta">{openCount} open</span>
        </div>
      </div>
      <ScopeChips businesses={businesses} scope={scope} counts={counts} onScope={setScope} />
      <PulseBar entries={scoped} />
      {openCount > 0 && (
        <button
          type="button"
          className="review-btn pressable"
          onClick={() => setReviewOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          </svg>
          Review with me
        </button>
      )}
      <BoardSection
        title="Your 20%"
        swatch="signal"
        entries={lev}
        people={peopleList}
        emptyTitle="Nothing only you can do right now."
        emptySub="Capture something and I'll flag the founder-level stuff."
        emptyIcon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8h1a3 3 0 0 1 0 6h-1" />
            <path d="M4 8h14v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
            <path d="M8 2c0 1-.5 1.2-.5 2S8 5 8 5M12 2c0 1-.5 1.2-.5 2s.5 1 .5 1" />
          </svg>
        }
        flashId={flashId}
        onToggleDone={handleToggleDone}
        onDelete={handleDeleteEntry}
        onOpen={setEditing}
        onLongPress={setAssigning}
        onToggleType={handleToggleType}
        isTypeToggleable={isTypeToggleable}
      />
      <BoardSection
        title="Delegated"
        swatch="noise"
        entries={del}
        people={peopleList}
        emptyTitle="Nothing handed off yet."
        emptySub="Operational stuff lands here with an owner slot."
        emptyIcon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        }
        flashId={flashId}
        onToggleDone={handleToggleDone}
        onDelete={handleDeleteEntry}
        onOpen={setEditing}
        onLongPress={setAssigning}
        onToggleType={handleToggleType}
        isTypeToggleable={isTypeToggleable}
      />
      {rev.length > 0 && (
        <BoardSection
          title="Needs a look"
          swatch="review"
          entries={rev}
          people={peopleList}
          flashId={flashId}
          onToggleDone={handleToggleDone}
          onDelete={handleDeleteEntry}
          onOpen={setEditing}
          onLongPress={setAssigning}
        />
      )}
      <DoneDrawer
        entries={done}
        people={peopleList}
        onToggleDone={handleToggleDone}
        onDelete={handleDeleteEntry}
        onOpen={setEditing}
      />

      <button
        type="button"
        className="fab pressable"
        aria-label="Quick add"
        onClick={() => setQuickAdd(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Sheet
        open={Boolean(editing || closeout || quickAdd || reviewOpen || assigning)}
        onClose={() => {
          if (closeout) setCloseout(null);
          else if (editing) setEditing(null);
          else if (assigning) setAssigning(null);
          else if (quickAdd) setQuickAdd(false);
          else setReviewOpen(false);
        }}
      >
        {closeout ? (
          <CloseoutSheet
            target={closeout}
            saving={saving}
            onLog={handleCloseoutLog}
            onSkip={() => setCloseout(null)}
          />
        ) : editing ? (
          <EntrySheet
            entry={editing}
            businesses={businesses}
            businessProjectType={businessProjectType}
            people={peopleList}
            evidence={evidence}
            saving={saving}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditing(null)}
            onPark={() => void handlePark()}
            onChecklistChanged={(entryId, checklist) => patchEntry(entryId, { checklist })}
            onMentionedPeopleChanged={(entryId, mentionedPeople) =>
              patchEntry(entryId, { mentionedPeople })
            }
            onPersonAdded={(person) => setPeopleList((prev) => [...prev, person])}
          />
        ) : assigning ? (
          <AssignSheet
            entry={assigning}
            people={peopleList}
            routing={assignRouting}
            saving={saving}
            onPick={(ownerId) => void handleAssign({ ownerId })}
            onAddNew={(name) => void handleAssign({ newOwnerName: name })}
            onClose={() => setAssigning(null)}
          />
        ) : quickAdd ? (
          <>
            <SheetHead title="Quick add" onClose={() => setQuickAdd(false)} />
            <CaptureBox onCaptured={handleQuickCapture} />
          </>
        ) : reviewOpen ? (
          <ReviewSheet
            businessId={scope === "all" ? null : scope}
            scopeName={
              scope === "all" ? null : (businesses.find((b) => b.id === scope)?.name ?? null)
            }
            onApply={handleReviewApply}
            onClose={() => setReviewOpen(false)}
          />
        ) : null}
      </Sheet>
      <Toast toast={toast} />
    </section>
  );
}
