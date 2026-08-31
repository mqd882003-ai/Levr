"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Entry } from "@/lib/types";
import CaptureQuestions, { type AskableItem } from "@/components/capture/CaptureQuestions";
import ProcessingOrbit from "@/components/capture/ProcessingOrbit";

const IDLE_STATUS = "Just talk or type. I'll sort out where it goes.";
const MAX_QUESTIONS = 3;
// Orbit threshold (intent-router-handoff §5): a quick capture stays instant;
// a long dump earns the full-screen dot-orbits-the-mark processing state.
const LONG_DUMP_CHARS = 120;
const ORBIT_MIN_MS = 2600; // let the dot actually orbit before landing

export interface CapturedExtras {
  businessName: string | null;
  projectName: string | null;
  classified: boolean;
}

interface CreatedEntrySummary {
  id: string;
  summary: string;
  business_id: string | null;
  mentioned_people: string[];
}

// Requirements §Interaction model rule-3 exception: up to MAX_QUESTIONS quick
// questions right after classification, people first (cheaper, more valuable
// to resolve), then unresolved business, oldest chunk first. Anything past
// the cap keeps its unresolved state and reaches the needs-review path.
function buildQuestionQueue(
  created: CreatedEntrySummary[],
  haveBusinesses: boolean,
): AskableItem[] {
  const people: AskableItem[] = [];
  const seen = new Set<string>();
  for (const e of created) {
    for (const raw of e.mentioned_people ?? []) {
      const name = raw.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      people.push({ kind: "person", entryId: e.id, name, businessId: e.business_id });
    }
  }
  const unresolved: AskableItem[] = haveBusinesses
    ? created
        .filter((e) => e.business_id === null)
        .map((e) => ({ kind: "business", entryId: e.id, summary: e.summary }))
    : [];
  return [...people, ...unresolved].slice(0, MAX_QUESTIONS);
}

// Minimal typings for the Web Speech API (secondary voice path only — the
// primary voice path is the phone keyboard's own dictation mic, per
// requirements §Voice input).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

// With `onCaptured`, the result is handed to the caller (Board quick-add drops
// the row into the list in place — no navigation, no skeleton flash). Without
// it, submit navigates to Board with the highlight param (Home behavior).
export default function CaptureBox({
  onCaptured,
  businesses,
}: {
  onCaptured?: (entry: Entry, extras: CapturedExtras) => void;
  // Home passes the roster for the question queue's business chips; quick-add
  // doesn't, and the queue never runs on that path anyway.
  businesses?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const usedVoiceRef = useRef(false);
  const [hasText, setHasText] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [questionQueue, setQuestionQueue] = useState<AskableItem[] | null>(null);
  const pendingNavRef = useRef<string | null>(null);
  // Orbit overlay phase (Home long dumps only). The continuation runs after
  // the landing animation settles so the sort visibly finishes first.
  const [orbitPhase, setOrbitPhase] = useState<null | "orbit" | "landing">(null);
  const orbitContinueRef = useRef<(() => void) | null>(null);

  // Set up in-app speech recognition only where it actually works: not as an
  // installed PWA (iOS Safari standalone silently breaks it). It must fail
  // gracefully everywhere else — the mic button then just focuses the field.
  useEffect(() => {
    try {
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        navigator: Navigator & { standalone?: boolean };
      };
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean(w.navigator.standalone);
      if (SR && !standalone) {
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          const ta = taRef.current;
          if (ta) {
            ta.value = (ta.value ? ta.value + " " : "") + transcript;
            usedVoiceRef.current = true;
            setHasText(Boolean(ta.value.trim()));
            autosize(ta);
          }
        };
        rec.onend = rec.onerror = () => setListening(false);
        recognitionRef.current = rec;
        setMicAvailable(true);
      }
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  const autosize = (ta: HTMLTextAreaElement) => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + "px";
  };

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      taRef.current?.focus();
      return;
    }
    if (listening) {
      rec.stop();
      return;
    }
    try {
      rec.start();
      setListening(true);
    } catch {
      taRef.current?.focus();
    }
  };

  const submit = useCallback(async () => {
    const ta = taRef.current;
    const text = ta?.value.trim();
    if (!ta || !text || sorting || questionQueue) return;

    const source = usedVoiceRef.current ? "voice" : "text";
    ta.value = "";
    usedVoiceRef.current = false;
    setHasText(false);
    autosize(ta);
    ta.blur();
    setSorting(true);
    setStatus("Sorting it out…");

    // Long dumps on Home take over the screen with the orbit (§5); quick
    // captures and Board quick-add stay exactly as they were.
    const useOrbit = !onCaptured && text.length > LONG_DUMP_CHARS;
    const orbitStart = Date.now();
    if (useOrbit) setOrbitPhase("orbit");

    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source }),
      });
      const data = (await res.json()) as {
        entry?: Entry;
        classified?: boolean;
        business_name?: string | null;
        project_name?: string | null;
        createdEntries?: CreatedEntrySummary[];
        error?: string;
      };
      if (!res.ok || !data.entry) {
        throw new Error(data.error || "Something went wrong");
      }
      // Wake the consult watcher — Tier 2 may route this one to a
      // conversation a few seconds from now (intent-router-handoff §4).
      window.dispatchEvent(new Event("levr:captured"));
      if (onCaptured) {
        setSorting(false);
        setStatus(IDLE_STATUS);
        onCaptured(data.entry, {
          businessName: data.business_name ?? null,
          projectName: data.project_name ?? null,
          classified: data.classified ?? false,
        });
        return;
      }
      // Requirements §Interaction model rule-3 exception: pause here for up
      // to 3 quick questions before Board. The entries are already saved —
      // closing the app mid-question loses nothing.
      const entry = data.entry;
      const proceed = () => {
        const queue = buildQuestionQueue(
          data.createdEntries ?? [],
          Boolean(businesses?.length),
        );
        if (queue.length) {
          pendingNavRef.current = entry.id;
          setSorting(false);
          setStatus(IDLE_STATUS);
          setQuestionQueue(queue);
          return;
        }
        router.push(`/board?new=${entry.id}`);
      };
      if (useOrbit) {
        // Let the dot finish at least one real orbit, then land and continue.
        const wait = Math.max(0, ORBIT_MIN_MS - (Date.now() - orbitStart));
        setTimeout(() => {
          orbitContinueRef.current = proceed;
          setOrbitPhase("landing");
        }, wait);
        return;
      }
      proceed();
    } catch (err) {
      // Don't lose the thought — put it back in the field.
      setOrbitPhase(null);
      orbitContinueRef.current = null;
      ta.value = text;
      setHasText(true);
      autosize(ta);
      setSorting(false);
      setStatus(
        err instanceof Error && err.message.includes("configured")
          ? "Backend isn't configured yet — fill in .env.local."
          : "Couldn't sort that one. Your text is still here — try again.",
      );
    }
  }, [router, sorting, onCaptured, businesses, questionQueue]);

  // Glass redesign (2026-08-31 handoff): Home only. Board's quick-add sheet
  // passes onCaptured and keeps the original compact in-card mic — the
  // handoff is explicit that only Home gets the standalone glass mic.
  const isHome = !onCaptured;
  const micLabel = micAvailable ? "Voice input" : "Focus the capture field";
  const micIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  );

  return (
    <>
      {orbitPhase && (
        <ProcessingOrbit
          landing={orbitPhase === "landing"}
          onLanded={() => {
            setOrbitPhase(null);
            const go = orbitContinueRef.current;
            orbitContinueRef.current = null;
            go?.();
          }}
        />
      )}
      <div className={`capture${isHome ? " glass" : ""}`}>
        <textarea
          ref={taRef}
          rows={2}
          placeholder="What's on your mind?"
          enterKeyHint="send"
          autoCapitalize="sentences"
          aria-label="Capture a thought"
          onInput={(e) => {
            const ta = e.currentTarget;
            setHasText(Boolean(ta.value.trim()));
            autosize(ta);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className={`capture-row${isHome ? " home" : ""}`}>
          {!isHome && (
            <span className="capture-hint">
              Tap the mic on your keyboard to talk
            </span>
          )}
          <button
            type="button"
            className={`send-btn pressable${hasText && !sorting ? " show" : ""}`}
            onClick={() => void submit()}
            aria-label="Levr, go"
          >
            Levr, go
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          {!isHome && (
            <button
              type="button"
              className={`mic-btn-inline pressable${listening ? " listening" : ""}`}
              onClick={toggleMic}
              aria-label={micLabel}
            >
              {micIcon}
            </button>
          )}
        </div>
      </div>
      {isHome ? (
        <div className="mic-standalone">
          <div className="mic-ring">
            <div className="pulse" aria-hidden="true" />
            <button
              type="button"
              className={`mic-btn pressable${listening ? " listening" : ""}`}
              onClick={toggleMic}
              aria-label={micLabel}
            >
              {listening ? (
                <span className="mic-bars" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              ) : (
                micIcon
              )}
            </button>
          </div>
          {questionQueue ? (
            <CaptureQuestions
              queue={questionQueue}
              businesses={businesses ?? []}
              onDone={() => {
                const id = pendingNavRef.current;
                setQuestionQueue(null);
                pendingNavRef.current = null;
                if (id) router.push(`/board?new=${id}`);
              }}
            />
          ) : (
            <div
              className={`mic-caption${sorting ? " sorting" : ""}`}
              aria-live="polite"
            >
              {sorting && <span className="spin" />}
              {listening ? "Listening…" : status}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`capture-status${sorting ? " sorting" : ""}`}
          aria-live="polite"
        >
          {sorting && <span className="spin" />}
          {status}
        </div>
      )}
    </>
  );
}
