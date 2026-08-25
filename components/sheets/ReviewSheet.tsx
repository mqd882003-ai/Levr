"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewSuggestion } from "@/app/api/review/route";
import { SheetHead } from "@/components/sheets/Sheet";

type Phase = "loading" | "questions" | "suggestions" | "error";

// Phase 2 §5 audit mode UI. One optional round of clarifying questions (max 3),
// then per-suggestion apply/dismiss — nothing applies automatically.
export default function ReviewSheet({
  businessId,
  scopeName,
  onApply,
  onClose,
}: {
  businessId: string | null;
  scopeName: string | null;
  onApply: (s: ReviewSuggestion) => Promise<boolean>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [resolved, setResolved] = useState<Record<string, "applied" | "dismissed">>({});
  const [error, setError] = useState("");

  const run = useCallback(
    async (qa: Array<{ question: string; answer: string }> | null) => {
      setPhase("loading");
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, ...(qa ? { qa } : {}) }),
        });
        const data = (await res.json()) as {
          questions?: string[];
          suggestions?: ReviewSuggestion[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Review failed");
        if (data.questions?.length) {
          setQuestions(data.questions);
          setAnswers(data.questions.map(() => ""));
          setPhase("questions");
        } else {
          setSuggestions(data.suggestions ?? []);
          setResolved({});
          setPhase("suggestions");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Review failed");
        setPhase("error");
      }
    },
    [businessId],
  );

  useEffect(() => {
    void run(null);
  }, [run]);

  const keyOf = (s: ReviewSuggestion) => `${s.entryId}:${s.field}`;

  const handleApply = async (s: ReviewSuggestion) => {
    const ok = await onApply(s);
    if (ok) setResolved((r) => ({ ...r, [keyOf(s)]: "applied" }));
  };

  const open = suggestions.filter((s) => !resolved[keyOf(s)]);

  return (
    <>
      <SheetHead
        title="Review with me"
        sub={scopeName ? `Looking at ${scopeName}` : "Looking at everything open"}
        onClose={onClose}
      />
      {phase === "loading" && (
        <div className="review-status">
          <span className="spin" />
          Taking a proper look…
        </div>
      )}
      {phase === "error" && (
        <>
          <div className="empty">
            <b>That didn&apos;t work.</b>
            {error}
          </div>
          <div className="actions">
            <button type="button" className="btn-ghost pressable" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary pressable" onClick={() => void run(null)}>
              Try again
            </button>
          </div>
        </>
      )}
      {phase === "questions" && (
        <>
          <div className="sheet-sub" style={{ marginBottom: 16 }}>
            Quick check before I weigh in:
          </div>
          {questions.map((q, i) => (
            <div className="field" key={i}>
              <label htmlFor={`rq-${i}`}>{q}</label>
              <input
                id={`rq-${i}`}
                value={answers[i]}
                placeholder="One line is plenty"
                onChange={(e) =>
                  setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
            </div>
          ))}
          <div className="actions">
            <button
              type="button"
              className="btn-primary pressable"
              onClick={() =>
                void run(questions.map((q, i) => ({ question: q, answer: answers[i].trim() })))
              }
            >
              Here you go
            </button>
          </div>
        </>
      )}
      {phase === "suggestions" &&
        (suggestions.length === 0 ? (
          <div className="empty">
            <b>Nothing I&apos;d change.</b>
            The board reads right to me as it stands.
          </div>
        ) : (
          <>
            {suggestions.map((s) => {
              const state = resolved[keyOf(s)];
              return (
                <div className="sug-item" key={keyOf(s)}>
                  <div className="sug-what">{s.entrySummary}</div>
                  <div className="sug-change">{s.changeLabel}</div>
                  <div className="sug-why">{s.reason}</div>
                  {state ? (
                    <div className="sug-change" style={{ marginBottom: 0 }}>
                      {state === "applied" ? "Applied" : "Dismissed"}
                    </div>
                  ) : (
                    <div className="sug-actions">
                      <button
                        type="button"
                        className="btn-ghost pressable"
                        onClick={() =>
                          setResolved((r) => ({ ...r, [keyOf(s)]: "dismissed" }))
                        }
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="btn-primary pressable"
                        onClick={() => void handleApply(s)}
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {open.length === 0 && (
              <div className="actions">
                <button type="button" className="btn-primary pressable" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </>
        ))}
    </>
  );
}
