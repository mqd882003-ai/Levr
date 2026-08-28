"use client";

import { useRef, useState } from "react";

// Swipe gesture per levr-swipe-prototype.html (spec direction mapping):
//   swipe RIGHT past threshold  -> commits Done on release (green reveal)
//   swipe LEFT  past threshold  -> snaps open; Delete fires ONLY on the
//                                  deliberate tap of the revealed button
//   tap with a panel revealed   -> just resets the panel
//   tap with nothing revealed   -> opens the detail sheet
// Purely visual feedback (no Vibration API — unsupported in iOS PWA context).
const THRESH = 70; // px of drag to commit/reveal
const MAX = 90; //    px before rubber-banding kicks in
const OPEN = 76; //   resting offset when the delete panel is revealed
const EDGE_GUARD = 24; // ignore touches starting here: Safari's back-swipe zone

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const TRASH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const PRESS_MS = 480; // board-gestures-handoff.md §3: ~450-500ms hold

export default function SwipeRow({
  rowId,
  rowClass,
  wrapClass = "",
  completeLabel,
  onComplete,
  onDelete, // resolves false if the delete failed (row springs back)
  onOpen,
  onLongPress, // press-and-hold → assign sheet; drag-move cancels the timer
  children,
}: {
  rowId: string;
  rowClass: string;
  wrapClass?: string;
  completeLabel: string;
  onComplete: () => void;
  onDelete: () => Promise<boolean>;
  onOpen: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, base: 0, dx: 0, moved: false });
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });
  const [revealed, setRevealed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pressed, setPressed] = useState(false);

  const cancelPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
    setPressed(false);
  };
  const armPress = () => {
    if (!onLongPress || revealed) return;
    press.current.fired = false;
    setPressed(true);
    press.current.timer = setTimeout(() => {
      press.current.timer = null;
      press.current.fired = true;
      setPressed(false);
      // A firing hold owns this touch: kill the in-flight drag so releasing
      // can't also commit a swipe, and snap the row back where it was.
      drag.current.active = false;
      drag.current.moved = false;
      setX(revealed ? -OPEN : 0, true);
      // Belt-and-braces vs .row-wrap's user-select:none — if the OS still
      // managed to start a selection during the hold, drop it before the
      // sheet opens so no handles linger behind it.
      window.getSelection()?.removeAllRanges();
      onLongPress();
    }, PRESS_MS);
  };

  const setX = (x: number, animate: boolean) => {
    const el = rowRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
  };
  const reset = () => {
    setX(0, true);
    setRevealed(false);
  };

  const start = (clientX: number, isTouch: boolean, target: EventTarget | null) => {
    // Leave the left screen edge to Safari's native back-swipe.
    if (isTouch && clientX < EDGE_GUARD) return;
    // The type badge is its own tap target — a press starting there should
    // neither arm the hold nor start a swipe (board-gestures-handoff.md §3).
    if (target instanceof Element && target.closest(".type-badge")) return;
    drag.current = {
      active: true,
      startX: clientX,
      base: revealed ? -OPEN : 0,
      dx: revealed ? -OPEN : 0,
      moved: false,
    };
    if (rowRef.current) rowRef.current.style.transition = "none";
    armPress();
  };
  const move = (clientX: number) => {
    const d = drag.current;
    if (!d.active) return;
    let x = d.base + (clientX - d.startX);
    if (Math.abs(x - d.base) > 6) {
      d.moved = true;
      cancelPress(); // a real drag is a swipe, not a hold
    }
    if (x > MAX) x = MAX + (x - MAX) * 0.15;
    if (x < -MAX) x = -MAX + (x + MAX) * 0.15;
    d.dx = x;
    setX(x, false);
  };
  const end = () => {
    cancelPress();
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.dx > THRESH) {
      // Committed right-swipe = Done, same handler the checkbox tap had.
      reset();
      onComplete();
    } else if (d.dx < -THRESH) {
      setX(-OPEN, true);
      setRevealed(true);
    } else {
      reset();
    }
  };

  const handleClick = () => {
    if (press.current.fired) {
      // The hold already opened the assign sheet — the release must not
      // also open the detail sheet.
      press.current.fired = false;
      return;
    }
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    if (revealed) {
      reset();
      return;
    }
    onOpen();
  };

  const handleDeleteTap = async () => {
    setRemoving(true);
    const ok = await onDelete();
    if (!ok) {
      setRemoving(false);
      reset();
    }
    // On success the parent removes the entry from state; the .removed
    // collapse covers the gap until the re-render lands.
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    start(e.clientX, false, e.target);
    const mv = (ev: MouseEvent) => move(ev.clientX);
    const up = () => {
      end();
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  return (
    <div className={`row-wrap${removing ? " removed" : ""}${wrapClass ? ` ${wrapClass}` : ""}`}>
      <div className="row-actions left" aria-hidden={!drag.current.active}>
        <button type="button" className="action-btn complete" tabIndex={-1} onClick={onComplete}>
          {CHECK}
          <span>{completeLabel}</span>
        </button>
      </div>
      <div className="row-actions right">
        <button
          type="button"
          className="action-btn delete"
          tabIndex={revealed ? 0 : -1}
          aria-label="Delete — confirms immediately"
          onClick={() => void handleDeleteTap()}
        >
          {TRASH}
          <span>Delete</span>
        </button>
      </div>
      <div
        id={rowId}
        ref={rowRef}
        className={`${rowClass}${pressed ? " pressed" : ""}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        onTouchStart={(e) => start(e.touches[0].clientX, true, e.target)}
        onTouchMove={(e) => move(e.touches[0].clientX)}
        onTouchEnd={end}
        onTouchCancel={end}
        onMouseDown={handleMouseDown}
        onContextMenu={(e) => {
          // Long-press must not summon the platform context menu mid-hold.
          if (onLongPress) e.preventDefault();
        }}
      >
        {children}
      </div>
    </div>
  );
}
