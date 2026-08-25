import { sendEmail } from "@/lib/channels/email";
import { sendSlack } from "@/lib/channels/slack";
import { sendSms } from "@/lib/channels/sms";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppSettings, Delegation, Person } from "@/lib/types";

// Spec §Delegation notifications: exactly ONE message, sent only because the
// user explicitly assigned this task to this person. No schedules, no digests,
// no retries on a timer. A failed send never blocks the assignment.
export interface NotifyResult {
  sent: boolean;
  channel: Person["preferred_channel"] | null;
  skipped?: "notifications_off";
  error?: string;
}

export async function notifyAssignment(delegationId: string): Promise<NotifyResult> {
  const db = supabaseServer();

  const [delegationRes, settingsRes] = await Promise.all([
    db.from("delegations").select("*").eq("id", delegationId).maybeSingle<Delegation>(),
    db.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>(),
  ]);
  const delegation = delegationRes.data;
  if (!delegation || !delegation.person_id) {
    return { sent: false, channel: null, error: "Delegation not found" };
  }
  if (settingsRes.data && !settingsRes.data.notifications_enabled) {
    return { sent: false, channel: null, skipped: "notifications_off" };
  }

  const personRes = await db
    .from("people")
    .select("*")
    .eq("id", delegation.person_id)
    .maybeSingle<Person>();
  const person = personRes.data;
  if (!person) return { sent: false, channel: null, error: "Person not found" };

  const senderName = settingsRes.data?.user_name || "your teammate";
  const task = delegation.expected_outcome ?? "a new task";
  const message = `${senderName} just handed you a task: ${task}`;

  const channel = person.preferred_channel;
  const result =
    channel === "sms"
      ? await sendSms(person.phone_number ?? "", message)
      : channel === "email"
        ? await sendEmail(
            person.email ?? "",
            `New task from ${senderName}`,
            message,
          )
        : await sendSlack(`*${person.name}* — ${message}`);

  if (!result.ok) {
    console.error(
      `notify failed (delegation ${delegationId}, ${channel} to ${person.name}):`,
      result.error,
    );
    return { sent: false, channel, error: result.error };
  }
  return { sent: true, channel };
}
