"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addBusiness,
  clearAllData,
  removeBusiness,
  updateSettings,
} from "@/app/settings/actions";
import Toast, { type ToastState } from "@/components/ui/Toast";
import type { AppSettings, Business } from "@/lib/types";

function Switch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      className={`switch${on ? " on" : ""}${disabled ? " disabled" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    />
  );
}

const TRASH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export default function SettingsClient({
  initialSettings,
  initialBusinesses,
}: {
  initialSettings: AppSettings;
  initialBusinesses: Business[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [newBiz, setNewBiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string, kind?: ToastState["kind"]) => {
    setToast({ msg, kind, key: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const saveName = async (raw: string) => {
    const name = raw.trim() || "there";
    if (name === settings.user_name) return;
    setSettings((s) => ({ ...s, user_name: name }));
    const res = await updateSettings({ userName: name });
    if (!res.ok) showToast(res.error ?? "Save failed", "bad");
    else showToast("Saved");
  };

  const toggle = async (key: "notifications" | "slack") => {
    const next =
      key === "notifications" ? !settings.notifications_enabled : !settings.slack_enabled;
    setSettings((s) =>
      key === "notifications"
        ? { ...s, notifications_enabled: next }
        : { ...s, slack_enabled: next },
    );
    const res = await updateSettings({ [key]: next });
    if (!res.ok) {
      setSettings((s) =>
        key === "notifications"
          ? { ...s, notifications_enabled: !next }
          : { ...s, slack_enabled: !next },
      );
      showToast(res.error ?? "Save failed", "bad");
      return;
    }
    if (key === "slack")
      showToast(next ? "Slack enabled — webhook is configured server-side" : "Slack off");
  };

  const handleAddBusiness = async () => {
    const name = newBiz.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await addBusiness(name);
    setBusy(false);
    if (!res.ok || !res.business) {
      showToast(res.error ?? "Add failed", "bad");
      return;
    }
    setBusinesses((prev) => [...prev, res.business!]);
    setNewBiz("");
    showToast(`${res.business.name} added`, "good");
  };

  const handleRemoveBusiness = async (b: Business) => {
    if (
      !window.confirm(
        `Remove ${b.name}? Items filed under it stay, but lose their business tag.`,
      )
    )
      return;
    const res = await removeBusiness(b.id);
    if (!res.ok) {
      showToast(res.error ?? "Remove failed", "bad");
      return;
    }
    setBusinesses((prev) => prev.filter((x) => x.id !== b.id));
    showToast("Removed");
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Clear ALL captured items, projects, people, and delegation history from the database? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    const res = await clearAllData();
    setBusy(false);
    if (!res.ok) {
      showToast(res.error ?? "Reset failed", "bad");
      return;
    }
    showToast("Cleared");
    router.refresh();
    setBusinesses([]);
    setTimeout(() => window.location.reload(), 600);
  };

  const channels: Array<{
    key: string;
    name: string;
    sub: string;
    available: boolean;
    on: boolean;
    toggleable: boolean;
  }> = [
    { key: "sms", name: "SMS", sub: "Default. Twilio, A2P-registered.", available: true, on: true, toggleable: false },
    { key: "email", name: "Email", sub: "Fallback for longer asks.", available: true, on: true, toggleable: false },
    { key: "slack", name: "Slack", sub: "Only if a workspace is connected.", available: true, on: settings.slack_enabled, toggleable: true },
    { key: "whatsapp", name: "WhatsApp", sub: "Coming soon", available: false, on: false, toggleable: false },
    { key: "push", name: "Push notifications", sub: "Once installed as an app", available: false, on: false, toggleable: false },
  ];

  return (
    <section className="screen" aria-label="Settings">
      <div className="topbar">
        <h1>Settings</h1>
      </div>
      <div className="settings">
        <div className="block">
          <div className="label">You</div>
          <div className="card">
            <div className="line">
              <span className="grow">Name</span>
              <input
                className="inline"
                defaultValue={settings.user_name}
                placeholder="Your name"
                autoComplete="given-name"
                aria-label="Your name"
                onBlur={(e) => void saveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
            <div className="line">
              <span className="grow">
                Notifications
                <span className="sub">One message per assignment. Nothing recurring.</span>
              </span>
              <Switch
                on={settings.notifications_enabled}
                label="Notifications"
                onToggle={() => void toggle("notifications")}
              />
            </div>
          </div>
        </div>

        <div className="block">
          <div className="label">Businesses</div>
          <div className="card">
            {businesses.map((b) => (
              <div className="line" key={b.id}>
                <span className="grow">{b.name}</span>
                <button
                  type="button"
                  className="icon-btn pressable"
                  aria-label={`Remove ${b.name}`}
                  onClick={() => void handleRemoveBusiness(b)}
                >
                  {TRASH}
                </button>
              </div>
            ))}
            <div className="add-row">
              <input
                value={newBiz}
                placeholder="Add a business"
                enterKeyHint="done"
                aria-label="Add a business"
                onChange={(e) => setNewBiz(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddBusiness();
                }}
              />
              <button type="button" className="pressable" disabled={busy} onClick={() => void handleAddBusiness()}>
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="block">
          <div className="label">Communication channels</div>
          <div className="card">
            {channels.map((ch) => (
              <div className="line" key={ch.key}>
                <span className="grow">
                  {ch.name}
                  <span className="sub">{ch.sub}</span>
                </span>
                {!ch.available && <span className="tag">Soon</span>}
                <Switch
                  on={ch.on}
                  disabled={!ch.available || !ch.toggleable}
                  label={ch.name}
                  onToggle={ch.toggleable ? () => void toggle("slack") : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="block">
          <div className="label">Data</div>
          <div className="card">
            <div className="line">
              <span className="grow">
                Storage
                <span className="sub">Synced to Supabase. Available on any device.</span>
              </span>
              <span className="tag good">Cloud</span>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <button type="button" className="danger pressable" disabled={busy} onClick={() => void handleReset()}>
            Clear all data
          </button>
        </div>
      </div>
      <Toast toast={toast} />
    </section>
  );
}
