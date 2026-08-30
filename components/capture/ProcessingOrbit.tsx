"use client";

import { useEffect, useRef, useState } from "react";

// Universal processing motion (intent-router-handoff §5, orbit mockup): for a
// long dump, the mark's signal dot lifts off the logo, orbits the mark while
// Tier 1 works through the capture, then drops back into place when it's
// sorted. The mark is the same inline SVG the PWA icons are generated from
// (scripts/icons.mjs) — the dot is a real element here, not a baked pixel.
const SLOGANS: Array<[string, string]> = [
  ["Sorting through it…", "this one's got a lot in it"],
  ["Untangling that…", "found more than one thing in here"],
  ["Almost got it…", "splitting this into pieces"],
  ["Nearly there…", "filing each one where it belongs"],
];

export default function ProcessingOrbit({
  landing,
  onLanded,
}: {
  // Parent flips this when the classify call resolves; the dot finishes its
  // revolution, drops home, and onLanded fires once the landing settles.
  landing: boolean;
  onLanded: () => void;
}) {
  const [lifted, setLifted] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [sloganIdx, setSloganIdx] = useState(0);
  const [sloganVisible, setSloganVisible] = useState(true);
  const pivotRef = useRef<HTMLDivElement>(null);
  const onLandedRef = useRef(onLanded);
  useEffect(() => {
    onLandedRef.current = onLanded;
  }, [onLanded]);

  // Lift-off choreography (mockup phases 1–2).
  useEffect(() => {
    const t1 = setTimeout(() => setLifted(true), 250);
    const t2 = setTimeout(() => setSpinning(true), 850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Slogans cycle underneath while it orbits.
  useEffect(() => {
    const t = setInterval(() => {
      setSloganVisible(false);
      setTimeout(() => {
        setSloganIdx((i) => (i + 1) % SLOGANS.length);
        setSloganVisible(true);
      }, 250);
    }, 1700);
    return () => clearInterval(t);
  }, []);

  // Landing: let the current revolution complete (no visible snap), then
  // drop the dot back onto the mark and hand control back.
  useEffect(() => {
    if (!landing) return;
    let done = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const land = () => {
      if (done) return;
      done = true;
      setSpinning(false);
      setLifted(false);
      settle = setTimeout(() => onLandedRef.current(), 750);
    };
    const pivot = pivotRef.current;
    pivot?.addEventListener("animationiteration", land);
    // Fallback: reduced-motion (or a missed event) must never strand the
    // overlay — land within one revolution regardless.
    const fallback = setTimeout(land, 1500);
    return () => {
      pivot?.removeEventListener("animationiteration", land);
      clearTimeout(fallback);
      clearTimeout(settle);
    };
  }, [landing]);

  const [slogan, sub] = SLOGANS[sloganIdx];

  return (
    <div className="orbit-overlay" role="status" aria-live="polite">
      <div className="orbit-wrap">
        <svg className="orbit-mark" viewBox="0 0 512 512" aria-hidden="true">
          <rect width="512" height="512" rx="112" fill="var(--text)" />
          <path
            d="M166 128v220h180"
            fill="none"
            stroke="var(--bg)"
            strokeWidth={44}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            className={`orbit-static-dot${lifted ? " away" : ""}`}
            cx="366"
            cy="146"
            r="26"
            fill="var(--signal)"
          />
        </svg>
        <div ref={pivotRef} className={`orbit-pivot${spinning ? " spin" : ""}`}>
          <div className={`orbit-dot${lifted ? " parked" : ""}`} />
        </div>
      </div>
      <div className={`orbit-slogan${sloganVisible ? "" : " fade"}`}>{slogan}</div>
      <div className={`orbit-sub${sloganVisible ? "" : " fade"}`}>{sub}</div>
      <div className="orbit-track">
        <div className="orbit-fill" style={{ width: landing ? "100%" : "92%" }} />
      </div>
      <div className="orbit-hint">Already saved — just deciding where it all goes</div>
    </div>
  );
}
