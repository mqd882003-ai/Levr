import type { SendResult } from "@/lib/channels/sms";

// Optional Slack channel via incoming webhook. Server-side only.
export async function sendSlack(text: string): Promise<SendResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { ok: false, error: "Slack is not configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { ok: false, error: `Slack error ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Slack send failed" };
  }
}
