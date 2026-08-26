// Row shapes matching supabase/migrations/001_init.sql.

export type Channel = "sms" | "email" | "slack";
export type EntryStatus = "open" | "done";
export type EntrySource = "voice" | "text";
export type Outcome = "done" | "late" | "not_done";
export type Verdict = "fully_trust" | "needs_coaching" | "pull_back";
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

export interface Person {
  id: string;
  name: string;
  role: string | null;
  business_id: string | null;
  phone_number: string | null;
  email: string | null;
  preferred_channel: Channel;
  capability_notes: string;
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

// What the classifier returns (see lib/classify.ts).
export interface Classification {
  business: string | null;
  project: string | null;
  is_leverage: boolean | null;
  summary: string;
  suggested_owner_id: string | null;
  category: string | null;
}
