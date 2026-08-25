"use client";

import { useEffect, useState } from "react";
import type { BoardEntry } from "@/lib/types";

// This week's signal-vs-noise ratio (requirements §Board: ratio of 20%-tagged
// to 80%-tagged entries captured in the last 7 days, within the current scope).
export default function PulseBar({ entries }: { entries: BoardEntry[] }) {
  const weekAgo = Date.now() - 7 * 86400000;
  const week = entries.filter(
    (e) => new Date(e.capturedAt).getTime() > weekAgo && e.isLeverage !== null,
  );
  const signal = week.filter((e) => e.isLeverage).length;
  const pct = week.length ? Math.round((signal / week.length) * 100) : 0;

  // Start at 0 and set on the next frame so the CSS width transition runs.
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div className="pulse-card">
      <div className="pulse-top">
        <span className="pulse-title">This week</span>
        <span className="pulse-nums">
          <b>{signal}</b> of {week.length} captured
        </span>
      </div>
      <div className="bar" role="progressbar" aria-label="Signal vs noise" aria-valuenow={pct}>
        <div className="fill" style={{ width: `${fill}%` }} />
      </div>
      <div className="pulse-foot">
        <span className="sig">{pct}% signal</span>
        <span>{100 - pct}% noise</span>
      </div>
    </div>
  );
}
