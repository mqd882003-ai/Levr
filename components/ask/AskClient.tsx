"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsultTurn } from "@/lib/consult";

// Full-screen consult conversation (intent-router-handoff §4). The assistant
// advises, it never decides: nothing typed here concludes, summarizes, or
// files anything — and none of it is saved. Leaving the screen ends it.
export default function AskClient({
  entryId,
  question,
  businessName,
  initialReply,
  autoOpened,
}: {
  entryId: string;
  question: string;
  businessName: string | null;
  initialReply: string | null;
  autoOpened: boolean;
}) {
  const router = useRouter();
  // Turns AFTER the opening question. The first assistant reply arrives via
  // props once Tier 2 resolves; until then the screen shows a thinking state.
  // sentTurns holds only what happened in THIS sitting; the first assistant
  // reply is derived from props so a late-arriving initialReply (after a
  // refresh poll) folds in without effect-driven state sync.
  const [sentTurns, setSentTurns] = useState<ConsultTurn[]>([]);
  const turns = useMemo<ConsultTurn[]>(
    () =>
      initialReply ? [{ role: "assistant", text: initialReply }, ...sentTurns] : [],
    [initialReply, sentTurns],
  );
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const waitingOnFirstReply = !initialReply;

  // First reply still cooking on Tier 2 — poll the server component until the
  // payload lands, then adopt it.
  useEffect(() => {
    if (!waitingOnFirstReply) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [waitingOnFirstReply, router]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, thinking]);

  // Ask the server for the next reply given the whole conversation so far
  // (retry re-sends the same conversation — the user's turn is already in).
  const requestReply = async (conversation: ConsultTurn[]) => {
    setFailed(false);
    setThinking(true);
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, turns: conversation }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || "no reply");
      setSentTurns((prev) => [...prev, { role: "assistant", text: data.reply! }]);
    } catch {
      setFailed(true);
    } finally {
      setThinking(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || thinking || waitingOnFirstReply) return;
    setDraft("");
    setSentTurns((prev) => [...prev, { role: "user", text }]);
    void requestReply([...turns, { role: "user", text }]);
  };

  return (
    <section className="screen ask-screen" aria-label="Ask">
      <div className="convo-header">
        <button
          type="button"
          className="back-btn pressable"
          aria-label="Back to Board"
          onClick={() => router.push("/board")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="convo-title">
          <div className="t1">Ask</div>
          {businessName && <div className="t2">{businessName}</div>}
        </div>
        {autoOpened && <span className="convo-badge">auto-opened</span>}
      </div>

      <div className="convo-body" ref={bodyRef}>
        <div className="bubble mine">{question}</div>
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role === "user" ? "mine" : "levr"}`}>
            {t.text}
          </div>
        ))}
        {(thinking || waitingOnFirstReply) && (
          <div className="bubble levr thinking" aria-label="Thinking">
            <span className="think-dot" />
            <span className="think-dot" />
            <span className="think-dot" />
          </div>
        )}
        {failed && (
          <div className="convo-error">
            Couldn&apos;t think that one through —{" "}
            <button type="button" onClick={() => void requestReply(turns)}>
              try again
            </button>
          </div>
        )}
      </div>

      <div className="convo-footnote">
        Nothing here gets filed or saved — just talk it through.
      </div>
      <div className="convo-input-bar">
        <input
          value={draft}
          placeholder={waitingOnFirstReply ? "Still thinking it over…" : "Reply…"}
          disabled={waitingOnFirstReply}
          aria-label="Reply"
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="convo-send pressable"
          aria-label="Send"
          disabled={thinking || waitingOnFirstReply || !draft.trim()}
          onClick={send}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </section>
  );
}
