import type { HouseholdEvent, Severity } from "@nexus/shared";
import { addAlert, expectedVisitors, members, minutesSince, reminders } from "./store.js";
import { reasonWithBedrock } from "./bedrock-reasoner.js";

// This is NEXUS's core differentiator: it does not surface raw events, it
// decides whether an event deserves a human's attention, and why. The
// scoring below is intentionally explainable (no black-box call), and stays
// the primary, always-available path so a demo never depends on a live
// model call succeeding. Only events that fall through every seeded rule
// (the closing `return` in `assessEventByRules`) get escalated to Bedrock
// for open-ended reasoning — see bedrock-reasoner.ts.

function isNightHours(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 6;
}

function findExpectedVisitor(now: Date) {
  return expectedVisitors.find((v) => {
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
  /** Rule id, "bedrock", or "default" — surfaced on the Fire TV so every decision is explainable. */
  decidedBy: string;
}

function assessEventByRules(event: HouseholdEvent): Assessment | null {
  const now = new Date(event.timestamp);

  if (event.type === "motion" || event.type === "doorbell") {
    const night = isNightHours(now);
    const expected = findExpectedVisitor(now);

    if (expected) {
      return {
        importance: "info",
        reasoning: `Front-door activity matches the expected ${expected.label}, so NEXUS didn't interrupt anyone.`,
        shouldAlert: false,
        suggestedActions: [],
        decidedBy: "rule-expected-visitor",
      };
    }

    if (night) {
      return {
        importance: "critical",
        reasoning: "Front-door activity outside expected hours with no visitor on record.",
        shouldAlert: true,
        suggestedActions: ["view", "notify_guardian"],
        decidedBy: "rule-night-door",
      };
    }

    return {
      importance: "notice",
      reasoning: "Unexpected visitor at the front door during normal hours.",
      shouldAlert: true,
      suggestedActions: ["view", "dismiss"],
      decidedBy: "rule-unexpected-visitor",
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
        decidedBy: "rule-missed-medication",
      };
    }

    return {
      importance: "info",
      reasoning: "Reminder missed but still within the normal grace period.",
      shouldAlert: false,
      suggestedActions: [],
      decidedBy: "rule-missed-medication",
    };
  }

  if (event.type === "check_in.started") {
    const member = members.find((m) => m.id === event.data.memberId);
    return {
      importance: "info",
      reasoning: `Check-in started with ${member?.name ?? "a household member"}.`,
      shouldAlert: false,
      suggestedActions: [],
      decidedBy: "rule-missed-medication",
    };
  }

  if (event.type === "guardian.notified") {
    return {
      importance: "info",
      reasoning: "The household guardian was notified.",
      shouldAlert: false,
      suggestedActions: [],
      decidedBy: "system",
    };
  }

  if (event.type === "door.opened.restricted") {
    return {
      importance: "warning",
      reasoning: "Door opened during a configured restricted period.",
      shouldAlert: true,
      suggestedActions: ["notify_guardian"],
      decidedBy: "rule-night-door",
    };
  }

  return null;
}

// When no rule matches and Bedrock can't be reached, NEXUS fails toward the
// human: an event it couldn't assess is shown without urgency rather than
// silently dropped. Quiet is a decision, and NEXUS only makes it with a reason.
const DEFAULT_ASSESSMENT: Assessment = {
  importance: "notice",
  reasoning: "NEXUS couldn't assess this event automatically, so it's shown here rather than dropped.",
  shouldAlert: true,
  suggestedActions: ["view", "dismiss"],
  decidedBy: "default",
};

export async function assessEvent(event: HouseholdEvent): Promise<Assessment> {
  const byRule = assessEventByRules(event);
  if (byRule) return byRule;

  const byBedrock = await reasonWithBedrock(event);
  if (byBedrock) return { ...byBedrock, decidedBy: "bedrock" };

  return DEFAULT_ASSESSMENT;
}

export async function processEvent(event: HouseholdEvent): Promise<HouseholdEvent> {
  const assessment = await assessEvent(event);
  event.importance = assessment.importance;
  event.reasoning = assessment.reasoning;
  event.decidedBy = assessment.decidedBy;

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
    default: {
      const words = event.type.replace(/[._]/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

type Alert = ReturnType<typeof addAlert>;
