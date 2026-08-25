// Row shapes matching supabase/migrations/001_init.sql.

export type Channel = "sms" | "email" | "slack";
export type EntryStatus = "open" | "done";
export type EntrySource = "voice" | "text";
export type Outcome = "done" | "late" | "not_done";
export type Verdict = "fully_trust" | "needs_coaching" | "pull_back";

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
}

export interface AppSettings {
  id: true;
  user_name: string;
  notifications_enabled: boolean;
  slack_enabled: boolean;
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
}

// What the classifier returns (see lib/classify.ts).
export interface Classification {
  business: string | null;
  project: string | null;
  is_leverage: boolean | null;
  summary: string;
  suggested_owner_id: string | null;
}
