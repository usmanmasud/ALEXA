import { randomUUID } from "node:crypto";
import type {
  Alert,
  DeviceStatus,
  HouseholdEvent,
  HouseholdMember,
  HouseholdRule,
  ExpectedVisitor,
  Reminder,
} from "@nexus/shared";

// In-memory household state for the hackathon build. Swap this module for a
// DynamoDB-backed implementation (see docs/BLUEPRINT.md for the table design)
// without touching the tools or the context engine — both only depend on
// this file's exported shape.

export const members: HouseholdMember[] = [
  { id: "mem-guardian", name: "You", role: "guardian" },
  { id: "mem-mom", name: "Mom", role: "dependent", needsCheckIn: true },
];

export const devices: DeviceStatus[] = [
  { id: "dev-doorbell", name: "Front Door", kind: "doorbell", online: true, lastSeen: new Date().toISOString() },
  { id: "dev-firetv", name: "Living Room Fire TV", kind: "display", online: true, lastSeen: new Date().toISOString() },
];

export const rules: HouseholdRule[] = [
  {
    id: "rule-night-door",
    description: "Flag any door open event between 11pm and 6am as high priority.",
    condition: "event.type === 'door.opened' && hour is between 23 and 6",
    action: "notify_guardian",
  },
  {
    id: "rule-missed-medication",
    description: "If a medication reminder is missed and no activity follows within 90 minutes, offer a check-in.",
    condition: "reminder.missed && inactivity >= 90m",
    action: "start_check_in",
  },
];

export const expectedVisitors: ExpectedVisitor[] = [];

export const reminders: Reminder[] = [
  {
    id: "rem-1",
    memberId: "mem-mom",
    label: "Evening medication",
    // Seeded 100 minutes overdue so it's already past the 90-minute
    // check-in threshold the moment the server starts, regardless of when
    // scripts/demo.mjs care is actually run against it.
    dueAt: new Date(Date.now() - 100 * 60_000).toISOString(),
    acknowledged: false,
  },
];

export const events: HouseholdEvent[] = [];
export const alerts: Alert[] = [];

export function addEvent(event: Omit<HouseholdEvent, "id">): HouseholdEvent {
  const full: HouseholdEvent = { id: randomUUID(), ...event };
  events.unshift(full);
  events.length = Math.min(events.length, 200);
  return full;
}

export function addAlert(alert: Omit<Alert, "id" | "createdAt" | "resolved">): Alert {
  const full: Alert = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    resolved: false,
    ...alert,
  };
  alerts.unshift(full);
  return full;
}

export function findEvent(eventId: string): HouseholdEvent | undefined {
  return events.find((e) => e.id === eventId);
}

export function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}
