"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Toast, { type ToastState } from "@/components/ui/Toast";

const POLL_MS = 8000;

// Consult auto-open rule (intent-router-handoff §4): resolving while the
// founder is ON Board auto-opens the conversation — BoardClient owns that.
// This watcher covers everywhere else: when a consult flips processing →
// confirmed and he's wandered off Board, it shows a quiet toast, never an
// interrupt. Mounted once in the root layout.
export default function ConsultWatcher() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const [toast, setToast] = useState<ToastState | null>(null);
  // null = haven't fetched yet this watch cycle (don't toast on first sight —
  // a consult may have resolved long before this page load).
  const knownRef = useRef<Map<string, string> | null>(null);
  const watchingRef = useRef(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch("/api/consult/pending");
        const data = (await res.json()) as {
          consults?: Array<{ id: string; intent_status: string }>;
        };
        const now = new Map((data.consults ?? []).map((c) => [c.id, c.intent_status]));
        const prev = knownRef.current;
        if (prev) {
          for (const [id, status] of now) {
            const was = prev.get(id);
            if (
              was === "processing" &&
              status === "confirmed" &&
              pathnameRef.current !== "/board" &&
              pathnameRef.current !== `/ask/${id}`
            ) {
              setToast({
                msg: "Levr worked through your question — it's waiting on Board.",
                kind: "signal",
                key: Date.now(),
              });
              setTimeout(() => setToast(null), 3600);
            }
          }
        }
        knownRef.current = now;
        // Keep polling only while something is still cooking.
        watchingRef.current = [...now.values()].includes("processing");
      } catch {
        // Network hiccup — try again next round if still watching.
      }
      if (watchingRef.current) timer = setTimeout(tick, POLL_MS);
    };

    const wake = () => {
      if (stopped || watchingRef.current) return;
      watchingRef.current = true;
      knownRef.current = null; // fresh baseline; never toast off stale diffs
      clearTimeout(timer);
      void tick();
    };

    // A capture just happened somewhere in the app — start watching in case
    // Tier 2 routes it to consult.
    window.addEventListener("levr:captured", wake);
    // One baseline check per page load catches an already-processing consult.
    wake();

    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("levr:captured", wake);
    };
  }, []);

  return <Toast toast={toast} />;
}
