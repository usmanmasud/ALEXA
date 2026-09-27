// Domain types shared between the NEXUS MCP server and the Fire TV / dashboard UI.
// Keeping these in one package means the context engine and the display
// can never silently drift out of sync on shape.

export type Severity = "info" | "notice" | "warning" | "critical";

export type EventSource = "ring" | "reminder" | "presence" | "system";

export interface HouseholdEvent {
  id: string;
  source: EventSource;
  type: string; // e.g. "motion", "doorbell", "reminder.missed", "presence.idle"
  timestamp: string; // ISO 8601
  data: Record<string, unknown>;
  /** Filled in by the context engine, not the raw source. */
  importance?: Severity;
  reasoning?: string;
  /** What produced the assessment: a named household rule, Amazon Bedrock, or the fail-safe default. */
  decidedBy?: string;
  acknowledged?: boolean;
}

export interface ExpectedVisitor {
  id: string;
  label: string; // "delivery", "guest:mom", etc.
  windowStart: string; // ISO 8601
  windowEnd: string; // ISO 8601
}

export interface HouseholdRule {
  id: string;
  description: string;
  // Simple condition/action shape so rules stay inspectable and demoable.
  condition: string;
  action: string;
}

export interface DeviceStatus {
  id: string;
  name: string;
  kind: "camera" | "doorbell" | "display" | "sensor";
  online: boolean;
  lastSeen: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  role: "guardian" | "dependent" | "member";
  needsCheckIn?: boolean;
}

export type AlertAction = "view" | "dismiss" | "check_in" | "notify_guardian";

export interface Alert {
  id: string;
  eventId: string;
  title: string;
  message: string;
  severity: Severity;
  actions: AlertAction[];
  createdAt: string;
  resolved: boolean;
}

export interface HomeStatus {
  overall: "normal" | "attention" | "alert";
  members: HouseholdMember[];
  devices: DeviceStatus[];
  pendingReminders: number;
  activeAlerts: Alert[];
  lastUpdated: string;
}

export interface Reminder {
  id: string;
  memberId: string;
  label: string;
  dueAt: string;
  acknowledged: boolean;
}
