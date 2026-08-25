"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyReviewSuggestion,
  closeoutDelegation,
  deleteEntry,
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
import CloseoutSheet, { type CloseoutTarget } from "@/components/sheets/CloseoutSheet";
import EntrySheet, { type EntrySheetSave } from "@/components/sheets/EntrySheet";
import Toast, { type ToastState } from "@/components/ui/Toast";
import type { BoardEntry, Business, Outcome, Person, Verdict } from "@/lib/types";

export default function BoardClient({
  initialEntries,
  businesses,
  people,
  newId,
}: {
  initialEntries: BoardEntry[];
  businesses: Business[];
  people: Person[];
  newId: string | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [scope, setScope] = useState("all");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardEntry | null>(null);
  const [closeout, setCloseout] = useState<CloseoutTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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
    if (res.assignedName) {
      const n = res.notification;
      if (n?.sent) {
        showToast(`Sent to ${res.assignedName} via ${(n.channel ?? "").toUpperCase()}`, "good");
      } else if (n?.skipped === "notifications_off") {
        showToast(`Assigned to ${res.assignedName}`, "good");
      } else {
        showToast(`Assigned to ${res.assignedName} — message didn't send`, "bad");
      }
    } else showToast("Saved");
  };

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

  const handleCloseoutLog = async (
    outcome: Outcome,
    verdict: Verdict | null,
    note: string,
  ) => {
    if (!closeout) return;
    setSaving(true);
    const res = await closeoutDelegation(closeout.delegationId, outcome, verdict, note);
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
        people={people}
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
      />
      <BoardSection
        title="Delegated"
        swatch="noise"
        entries={del}
        people={people}
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
      />
      {rev.length > 0 && (
        <BoardSection
          title="Needs a look"
          swatch="review"
          entries={rev}
          people={people}
          flashId={flashId}
          onToggleDone={handleToggleDone}
          onDelete={handleDeleteEntry}
          onOpen={setEditing}
        />
      )}
      <DoneDrawer
        entries={done}
        people={people}
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
        open={Boolean(editing || closeout || quickAdd || reviewOpen)}
        onClose={() => {
          if (closeout) setCloseout(null);
          else if (editing) setEditing(null);
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
            people={people}
            saving={saving}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditing(null)}
            onChecklistChanged={(entryId, checklist) => patchEntry(entryId, { checklist })}
          />
        ) : quickAdd ? (
          <>
            <SheetHead title="Quick add" onClose={() => setQuickAdd(false)} />
            <CaptureBox />
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
