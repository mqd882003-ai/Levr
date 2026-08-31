import { assessProtectedWindowUrgency } from "@/lib/tier2";
import { sendEmail } from "@/lib/channels/email";
import { sendSlack } from "@/lib/channels/slack";
import { sendSms } from "@/lib/channels/sms";
import { sendPush } from "@/lib/push";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppSettings, Delegation, PersonalSettings, Person, ProtectedWindow } from "@/lib/types";

// Spec §Delegation notifications: exactly ONE message, sent only because the
// user explicitly assigned this task to this person. No schedules, no digests,
// no retries on a timer. A failed send never blocks the assignment.
//
// HANDOFF-personal-config-import.md task 3 adds one gate in front of that: if
// sending right now would fall inside one of Dave's protected windows, hold
// it — send only if Tier 2 (Sonnet) judges it genuinely urgent against his
// override_rule, or once the window closes naturally (flushHeldNotifications,
// run on a schedule — see app/api/notify/flush/route.ts).
export interface NotifyResult {
  sent: boolean;
  channel: Person["preferred_channel"] | null;
  skipped?: "notifications_off" | "no_contact";
  held?: boolean;
  // Either a genuine send error, or — when held is true — why it's being
  // held (which protected window, and Tier 2's reasoning if it resolved).
  error?: string;
}

// Dave's protected_windows are plain "HH:mm" local clock times with no
// timezone of their own — assumed Pacific (the Vercel region is pinned to
// pdx1). Flag/correct if that's ever wrong.
const DAVE_TIMEZONE = "America/Los_Angeles";

function localParts(tz: string, at: Date): { minutes: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    day: weekdayIndex[get("weekday")] ?? at.getDay(),
  };
}

function isWindowActive(win: ProtectedWindow, minutesNow: number, dayNow: number): boolean {
  if (!win.silent) return false; // e.g. the Midday check-in reminder — not a hold window
  const sundaysOnly = /sunday/i.test(win.frequency);
  if (win.start === null || win.end === null) {
    // No clock time to check against. A day-scoped window (frequency names a
    // specific day, e.g. Church's "Sundays") is active for that whole day;
    // anything else with no explicit time (e.g. Dinner's "daily") can't be
    // evaluated and is treated as not currently active rather than guessed —
    // it needs an explicit start/end from Dave to actually gate holds.
    return sundaysOnly && dayNow === 0;
  }
  if (sundaysOnly && dayNow !== 0) return false;
  const [sh, sm] = win.start.split(":").map(Number);
  const [eh, em] = win.end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return false;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins <= endMins) return minutesNow >= startMins && minutesNow < endMins;
  return minutesNow >= startMins || minutesNow < endMins; // overnight wrap (e.g. Sleep)
}

function findActiveWindow(windows: ProtectedWindow[], at: Date = new Date()): ProtectedWindow | null {
  const { minutes, day } = localParts(DAVE_TIMEZONE, at);
  return windows.find((w) => isWindowActive(w, minutes, day)) ?? null;
}

async function loadPersonalSettings(): Promise<PersonalSettings | null> {
  const db = supabaseServer();
  const res = await db.from("personal_settings").select("*").eq("id", true).maybeSingle<PersonalSettings>();
  return res.data;
}

// The actual channel send — shared by the immediate path and the flush path.
async function sendDelegationMessage(delegation: Delegation): Promise<NotifyResult> {
  const db = supabaseServer();
  const [personRes, settingsRes] = await Promise.all([
    db.from("people").select("*").eq("id", delegation.person_id).maybeSingle<Person>(),
    db.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>(),
  ]);
  const person = personRes.data;
  if (!person) return { sent: false, channel: null, error: "Person not found" };

  const senderName = settingsRes.data?.user_name || "your teammate";
  const task = delegation.expected_outcome ?? "a new task";
  // A5: silent by default — only the exception gets the unmissable prefix.
  // Same wording across all channels for v1.
  const message = delegation.confirm_first
    ? `⚠️ Confirm with ${senderName} before starting — ${task}`
    : `${senderName} just handed you a task: ${task}`;

  const channel = person.preferred_channel;
  // A1: a person added inline may have no contact info yet — that's a quiet
  // skip, not a failure.
  if (
    (channel === "sms" && !person.phone_number?.trim()) ||
    (channel === "email" && !person.email?.trim())
  ) {
    return { sent: false, channel, skipped: "no_contact" };
  }
  const result =
    channel === "sms"
      ? await sendSms(person.phone_number ?? "", message)
      : channel === "email"
        ? await sendEmail(person.email ?? "", `New task from ${senderName}`, message)
        : await sendSlack(`*${person.name}* — ${message}`);

  if (!result.ok) {
    console.error(
      `notify failed (delegation ${delegation.id}, ${channel} to ${person.name}):`,
      result.error,
    );
    return { sent: false, channel, error: result.error };
  }
  return { sent: true, channel };
}

async function recordNotifyOutcome(delegationId: string, result: NotifyResult): Promise<void> {
  const db = supabaseServer();
  const notify_status = result.sent
    ? "sent"
    : result.held
      ? "held"
      : result.skipped
        ? "skipped"
        : "failed";
  const notify_note = result.held
    ? (result.error ?? null)
    : result.skipped
      ? result.skipped
      : (result.error ?? null);
  await db.from("delegations").update({ notify_status, notify_note }).eq("id", delegationId);
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

  const personal = await loadPersonalSettings();
  const activeWindow = personal ? findActiveWindow(personal.protected_windows) : null;

  if (activeWindow) {
    const task = delegation.expected_outcome ?? "a new task";
    let urgent = false;
    let reason = "";
    try {
      const assessment = await assessProtectedWindowUrgency(
        task,
        activeWindow.label,
        personal!.override_rule,
      );
      urgent = assessment.urgent;
      reason = assessment.reason;
    } catch (err) {
      // Tier 2 didn't resolve — same "don't interrupt unless certain" bias
      // as the rest of the Personal branch logic: default to holding.
      console.error("protected-window urgency check failed, defaulting to hold:", err);
    }
    if (!urgent) {
      const result: NotifyResult = {
        sent: false,
        channel: null,
        held: true,
        error: `Held during ${activeWindow.label}${reason ? " — " + reason : ""}`,
      };
      await recordNotifyOutcome(delegationId, result);
      return result;
    }
  }

  const result = await sendDelegationMessage(delegation);
  await recordNotifyOutcome(delegationId, result);
  return result;
}

// Run on a schedule (see app/api/notify/flush/route.ts + vercel.json crons).
// Sends anything held once NO protected window is currently active — this
// does not re-ask Tier 2, it just waits the window out, per spec.
export async function flushHeldNotifications(): Promise<{ checked: number; sent: number }> {
  const db = supabaseServer();
  const heldRes = await db.from("delegations").select("*").eq("notify_status", "held");
  const held = (heldRes.data ?? []) as Delegation[];
  if (!held.length) return { checked: 0, sent: 0 };

  const settingsRes = await db.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>();
  if (settingsRes.data && !settingsRes.data.notifications_enabled) {
    for (const delegation of held) {
      await recordNotifyOutcome(delegation.id, {
        sent: false,
        channel: null,
        skipped: "notifications_off",
      });
    }
    return { checked: held.length, sent: 0 };
  }

  const personal = await loadPersonalSettings();
  const stillProtected = personal ? findActiveWindow(personal.protected_windows) !== null : false;
  if (stillProtected) return { checked: held.length, sent: 0 };

  let sent = 0;
  for (const delegation of held) {
    const result = await sendDelegationMessage(delegation);
    await recordNotifyOutcome(delegation.id, result);
    if (result.sent) {
      sent++;
      // Phase 3 (013/014 web push): additive confirmation to Dave that a
      // held message finally went out, so he doesn't have to check the
      // delegation record to find out. Awaited (not fire-and-forget) since
      // the whole cron route awaits this function before responding —
      // firing it un-awaited risks the serverless function freezing before
      // the push actually sends. Its own try/catch means a failure here
      // never affects the (already-recorded) real send above.
      await sendHeldFlushConfirmation(delegation);
    }
  }
  return { checked: held.length, sent };
}

async function sendHeldFlushConfirmation(delegation: Delegation): Promise<void> {
  try {
    const db = supabaseServer();
    const task = delegation.expected_outcome ?? "a task";
    const person = await db
      .from("people")
      .select("name")
      .eq("id", delegation.person_id)
      .maybeSingle<Pick<Person, "name">>();
    const personName = person.data?.name ?? "them";
    await sendPush({
      title: "Sent while you were away",
      body: `${task} → ${personName}`,
      url: "/board",
    });
  } catch (err) {
    console.error("held-flush confirmation push failed:", err);
  }
}
