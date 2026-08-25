"use client";

export interface ToastState {
  msg: string;
  kind?: "signal" | "noise" | "good" | "bad";
  key: number;
}

export default function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div className={`toast${toast ? " show" : ""}`} role="status">
      {toast?.kind && (
        <span className="sw" style={{ background: `var(--${toast.kind})` }} />
      )}
      {toast?.msg}
    </div>
  );
}
