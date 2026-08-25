"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const IDLE_STATUS = "Just talk or type. I'll sort out where it goes.";

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

export default function CaptureBox() {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const usedVoiceRef = useRef(false);
  const [hasText, setHasText] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [status, setStatus] = useState(IDLE_STATUS);

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
    if (!ta || !text || sorting) return;

    const source = usedVoiceRef.current ? "voice" : "text";
    ta.value = "";
    usedVoiceRef.current = false;
    setHasText(false);
    autosize(ta);
    ta.blur();
    setSorting(true);
    setStatus("Sorting it out…");

    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source }),
      });
      const data = (await res.json()) as {
        entry?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.entry) {
        throw new Error(data.error || "Something went wrong");
      }
      router.push(`/board?new=${data.entry.id}`);
    } catch (err) {
      // Don't lose the thought — put it back in the field.
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
  }, [router, sorting]);

  return (
    <>
      <div className="capture">
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
        <div className="capture-row">
          <span className="capture-hint">
            Tap the mic on your keyboard to talk
          </span>
          <button
            type="button"
            className={`send-btn pressable${hasText && !sorting ? " show" : ""}`}
            onClick={() => void submit()}
            aria-label="Sort it"
          >
            Sort it
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            className={`mic-btn pressable${listening ? " listening" : ""}`}
            onClick={toggleMic}
            aria-label={micAvailable ? "Voice input" : "Focus the capture field"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className={`capture-status${sorting ? " sorting" : ""}`}
        aria-live="polite"
      >
        {sorting && <span className="spin" />}
        {status}
      </div>
    </>
  );
}
