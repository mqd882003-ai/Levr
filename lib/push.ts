import webpush from "web-push";
import { supabaseServer } from "@/lib/supabase/server";
import type { PushSubscriptionRow } from "@/lib/types";

// Web Push to Dave's installed PWA — parallel to lib/channels/sms.ts, but
// fans out to every stored subscription (realistically one row; see 013).
// Separate channel entirely from the Twilio SMS pipeline in lib/notify.ts,
// which this never touches.
export interface PushPayload {
  title: string;
  body: string;
  url?: string; // route to open on notificationclick (default "/")
}

let vapidConfigured = false;
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

// A failed push must never block whatever server action or cron triggered
// it (same rule as SMS — spec §Delegation notifications) — every failure
// path here is caught, none rethrown.
export async function sendPush(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  try {
    if (!ensureVapidConfigured()) return { sent: 0, failed: 0 };
    const db = supabaseServer();
    const res = await db.from("push_subscriptions").select("*");
    const subscriptions = (res.data ?? []) as PushSubscriptionRow[];
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 = the browser dropped this subscription (unsubscribed,
        // cleared site data, uninstalled) — stop retrying it forever.
        if (statusCode === 404 || statusCode === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed:", err);
        }
      }
    }
    return { sent, failed };
  } catch (err) {
    console.error("sendPush failed:", err);
    return { sent: 0, failed: 0 };
  }
}
