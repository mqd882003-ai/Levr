// Twilio SMS via plain REST (no SDK dependency). Server-side only.
export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { ok: false, error: "SMS is not configured" };

  const digits = to.replace(/[^\d+]/g, "");
  if (!digits) return { ok: false, error: "No phone number on file" };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: digits, From: from, Body: body }),
      },
    );
    const data = (await res.json()) as { message?: string; sid?: string };
    if (!res.ok) {
      return { ok: false, error: data.message ?? `Twilio error ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMS send failed" };
  }
}
