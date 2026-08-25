"use client";

import { useEffect, useRef } from "react";

// The app's only modal: bottom sheet + backdrop (DESIGN.md §5). Kept mounted
// so the slide transition runs; children render only while open (or during
// the close animation, via the keepChildren ref below).
export default function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const lastChildren = useRef<React.ReactNode>(null);
  if (open) lastChildren.current = children;

  useEffect(() => {
    if (open) sheetRef.current?.scrollTo({ top: 0 });
  }, [open]);

  return (
    <>
      <div
        className={`backdrop${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={`sheet${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="grab" />
        {open ? children : lastChildren.current}
      </div>
    </>
  );
}

export function SheetHead({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
}) {
  return (
    <div className="sheet-head">
      <div>
        <div className="sheet-title">{title}</div>
        {sub && <div className="sheet-sub">{sub}</div>}
      </div>
      <button
        type="button"
        className="close-btn pressable"
        onClick={onClose}
        aria-label="Close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
