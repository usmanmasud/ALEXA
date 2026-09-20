import type { HouseholdEvent, Severity } from "@nexus/shared";
import { addAlert, expectedVisitors, members, minutesSince, reminders } from "./store.js";

// This is NEXUS's core differentiator: it does not surface raw events, it
// decides whether an event deserves a human's attention, and why. The
// scoring below is intentionally explainable (no black-box call) so the
// reasoning can be demoed and narrated; a Bedrock/AgentCore call can sit
// behind `explain()` later without changing the interface (see BLUEPRINT.md).

function isNightHours(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 6;
}

function hasExpectedVisitor(now: Date): boolean {
  return expectedVisitors.some((v) => {
    const start = new Date(v.windowStart).getTime();
    const end = new Date(v.windowEnd).getTime();
    return now.getTime() >= start && now.getTime() <= end;
  });
}

interface Assessment {
  importance: Severity;
  reasoning: string;
  shouldAlert: boolean;
  suggestedActions: string[];
}

export function assessEvent(event: HouseholdEvent): Assessment {
  const now = new Date(event.timestamp);

  if (event.type === "motion" || event.type === "doorbell") {
    const night = isNightHours(now);
    const expected = hasExpectedVisitor(now);

    if (expected) {
      return {
        importance: "info",
        reasoning: "Motion matches an expected visitor window, no interruption needed.",
        shouldAlert: false,
        suggestedActions: [],
      };
    }

    if (night) {
      return {
        importance: "critical",
        reasoning: "Front-door activity outside expected hours with no visitor on record.",
        shouldAlert: true,
        suggestedActions: ["view", "notify_guardian"],
      };
    }

    return {
      importance: "notice",
      reasoning: "Unexpected visitor at the front door during normal hours.",
      shouldAlert: true,
      suggestedActions: ["view", "dismiss"],
    };
  }

  if (event.type === "reminder.missed") {
    const memberId = event.data.memberId as string | undefined;
    const member = members.find((m) => m.id === memberId);
    const reminder = reminders.find((r) => r.id === (event.data.reminderId as string | undefined));
    const overdueMinutes = reminder ? minutesSince(reminder.dueAt) : 0;

    if (member?.needsCheckIn && overdueMinutes >= 90) {
      return {
        importance: "warning",
        reasoning: `${member.name} hasn't acknowledged a reminder and no activity has followed for ${Math.round(
          overdueMinutes,
        )} minutes.`,
        shouldAlert: true,
        suggestedActions: ["check_in", "notify_guardian"],
      };
    }

    return {
      importance: "info",
      reasoning: "Reminder missed but still within the normal grace period.",
      shouldAlert: false,
      suggestedActions: [],
    };
  }

  if (event.type === "door.opened.restricted") {
    return {
      importance: "warning",
      reasoning: "Door opened during a configured restricted period.",
      shouldAlert: true,
      suggestedActions: ["notify_guardian"],
    };
  }

  return {
    importance: "info",
    reasoning: "No rule matched; logged for context only.",
    shouldAlert: false,
    suggestedActions: [],
  };
}

export function processEvent(event: HouseholdEvent): HouseholdEvent {
  const assessment = assessEvent(event);
  event.importance = assessment.importance;
  event.reasoning = assessment.reasoning;

  if (assessment.shouldAlert) {
    addAlert({
      eventId: event.id,
      title: titleFor(event),
      message: assessment.reasoning,
      severity: assessment.importance,
      actions: assessment.suggestedActions as Alert["actions"],
    });
  }

  return event;
}

function titleFor(event: HouseholdEvent): string {
  switch (event.type) {
    case "motion":
    case "doorbell":
      return "Someone is at the front door";
    case "reminder.missed":
      return "Check-in suggested";
    case "door.opened.restricted":
      return "Door opened during restricted hours";
    default:
      return "Household event";
  }
}

type Alert = ReturnType<typeof addAlert>;
