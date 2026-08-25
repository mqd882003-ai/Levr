import type { SendResult } from "@/lib/channels/sms";

// Transactional email via Resend's REST API. Server-side only.
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || key === "REPLACE_ME" || !from) {
    return { ok: false, error: "Email is not configured" };
  }
  if (!to.trim()) return { ok: false, error: "No email address on file" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to.trim()], subject, text }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: data?.message ?? `Resend error ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
