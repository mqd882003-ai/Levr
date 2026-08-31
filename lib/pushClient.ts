"use client";

// Browser-only Web Push helpers for the Settings toggle. Nothing here runs
// unless the user taps the toggle — no auto-prompt on load (handoff
// non-goal), and the service worker itself is only registered lazily, on
// first subscribe.
export interface SubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Requests permission (must be called from a user gesture — the toggle tap),
// registers the service worker if needed, and subscribes. Returns null on
// any unsupported/denied outcome rather than throwing, so the caller can
// show one plain "didn't work" toast instead of juggling error types.
export async function subscribeToPush(): Promise<SubscriptionJSON | null> {
  if (!pushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push isn't configured (missing VAPID public key)");

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));
  return subscription.toJSON() as SubscriptionJSON;
}

// Returns the endpoint that was unsubscribed (so the caller can delete the
// matching server-side row), or null if there was nothing to unsubscribe.
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
