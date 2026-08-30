// Row shapes matching supabase/migrations/001_init.sql.

export type Channel = "sms" | "email" | "slack";
export type EntryStatus = "open" | "done";
export type EntrySource = "voice" | "text";
export type Outcome = "done" | "late" | "not_done";
export type Verdict = "fully_trust" | "needs_coaching" | "pull_back";
export type DelegationStage = "assigned" | "contacted" | "appointment_set" | "closed" | "lost";
export type NotifyStatus = "sent" | "held" | "skipped" | "failed";
// A4 closeout diagnosis chips; only not_ready / no_follow_through feed trust.
export type Diagnosis =
  | "unclear_brief"
  | "not_ready"
  | "bandwidth"
  | "blocked"
  | "no_follow_through";

export interface Category {
  id: string;
  name: string;
  status: "active" | "proposed";
  created_at: string;
}

export interface Business {
  id: string;
  name: string;
  created_at: string;
}

export type ProjectType = "delegatable" | "personal_project";

export interface ProtectedWindow {
  label: string;
  start: string | null; // "HH:mm", null when the window has no fixed clock time
  end: string | null;
  frequency: string; // e.g. "daily", "Sundays", "4-5x/week"
  silent: boolean; // true = hold notifications during this window
  type?: "protected" | "reminder"; // reminder = prompt Dave, not a hold-notifications window
  non_negotiable?: boolean;
  note?: string;
}

export interface QuietHoursException {
  label: string;
  start: string | null;
  end: string | null;
}

export interface PersonalSettings {
  id: true;
  protected_windows: ProtectedWindow[];
  override_rule: string;
  notification_rule: string;
  notification_quiet_hours: {
    default: { start: string; end: string } | null;
    exceptions: QuietHoursException[];
  };
}

export interface BusinessSettings {
  id: string;
  business_id: string;
  project_type: ProjectType;
  vision_goal: string;
  current_friction: string;
  priority_fixes: string[];
  role_breakdown: string;
  freeform_notes: string;
  created_at: string;
}

export interface Person {
  id: string;
  name: string;
  role: string | null;
  business_id: string | null;
  phone_number: string | null;
  email: string | null;
  preferred_channel: Channel;
  capability_notes: string;
  capacity_limit: number | null; // 011: max open delegations; null = no limit set
  created_at: string;
}

export interface Project {
  id: string;
  business_id: string | null;
  name: string;
  created_from_entry_id: string | null;
  created_at: string;
}

export type Tier2Status = "confirmed" | "revised" | "flagged" | "failed";

// 012: intent router. capture_intent defaults to 'task'; the other fields are
// only populated for special intents (intent-router-handoff §3).
export type CaptureIntent =
  | "task"
  | "person_note"
  | "outcome_report"
  | "consult"
  | "decision";
export type IntentStatus = "processing" | "pending_confirm" | "confirmed" | "dismissed";

export interface PersonAlias {
  id: string;
  alias_text: string;
  person_id: string;
  confirmed_at: string;
}

export interface Entry {
  id: string;
  text: string;
  summary: string | null;
  business_id: string | null;
  project_id: string | null;
  is_leverage: boolean | null;
  status: EntryStatus;
  suggested_person_id: string | null;
  source: EntrySource;
  captured_at: string;
  done_at: string | null;
  tier2_status: Tier2Status | null;
  tier2_reason: string | null;
  tier2_at: string | null;
  category: string | null;
  parked_until: string | null;
  split_from_entry_id: string | null;
  mentioned_people: string[];
  explicit_deadline: string | null;
  deadline_at: string | null; // parsed from explicit_deadline at save time (010) — null = undated
  deadline_all_day: boolean; // date known but no clock time stated
  stated_reason: string | null;
  capture_intent: CaptureIntent;
  intent_status: IntentStatus | null;
  intent_person_id: string | null;
  intent_delegation_id: string | null;
  intent_payload: string | null; // JSON per intent (candidates / consult reply / closeout target)
  intent_evidence: string | null; // the literal snippet Gate 1 pointed to
}

export interface ChecklistItem {
  id: string;
  entry_id: string;
  text: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export type CorrectionField =
  | "business"
  | "project"
  | "is_leverage"
  | "owner"
  | "capability_notes";

export interface Correction {
  id: string;
  entry_id: string | null;
  person_id: string | null;
  field: CorrectionField;
  from_value: string | null;
  to_value: string | null;
  entry_text: string | null;
  created_at: string;
}

export interface Delegation {
  id: string;
  entry_id: string;
  person_id: string | null;
  expected_outcome: string | null;
  actual_outcome: Outcome | null;
  verdict: Verdict | null;
  outcome_note: string | null;
  assigned_at: string;
  resolved_at: string | null;
  category: string | null;
  confirm_first: boolean;
  diagnosis: Diagnosis | null;
  flag_shown: string | null;
  stage: DelegationStage | null;
  notify_status: NotifyStatus | null;
  notify_note: string | null;
}

export interface AppSettings {
  id: true;
  user_name: string;
  notifications_enabled: boolean;
  slack_enabled: boolean;
  auto_notes: boolean;
}

// Flattened view model the Board screen works with (entry + joined names +
// current owner from the open delegation, if any).
export interface BoardEntry {
  id: string;
  text: string;
  summary: string;
  businessId: string | null;
  businessName: string | null;
  projectId: string | null;
  projectName: string | null;
  isLeverage: boolean | null;
  done: boolean;
  suggestedPersonId: string | null;
  capturedAt: string;
  ownerId: string | null;
  openDelegationId: string | null;
  tier2Status: Tier2Status | null;
  tier2Reason: string | null;
  checklist: Array<Pick<ChecklistItem, "id" | "text" | "done">>;
  category: string | null;
  parkedUntil: string | null;
  mentionedPeople: string[];
  captureIntent: CaptureIntent;
  intentStatus: IntentStatus | null;
  intentPersonId: string | null;
  intentDelegationId: string | null;
  intentPayload: string | null;
}

// 011: routing junction rows.
export type RatingLevel = "not_ready" | "learning" | "capable" | "strong";
export type RatingSource = "declared" | "earned";

export interface PersonCategoryRating {
  id: string;
  person_id: string;
  category_id: string;
  level: RatingLevel;
  source: RatingSource;
  updated_at: string;
}

export interface RoutingRecommendationRow {
  id: string;
  entry_id: string | null;
  recommended_person_id: string | null;
  score: number | null;
  reasons: Record<string, unknown> | null;
  accepted: boolean | null; // null until a human acts: true = confirmed, false = overrode
  overridden_to_person_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

// Slim resolved-history rows the assignment sheet uses for per-category trust.
export interface TrustEvidence {
  person_id: string;
  category: string | null;
  resolved_at: string;
  actual_outcome: Outcome | null;
  verdict: Verdict | null;
  diagnosis: Diagnosis | null;
  expected_outcome: string | null;
}
