import type { AlertAction } from "@nexus/shared";
import { addEvent, addExpectedVisitor, alerts, findEvent, members } from "./store.js";
import { processEvent } from "./context-engine.js";
import { getFireTvView, setFireTvView } from "./firetv-state.js";
import { deliverToGuardian } from "./notifier.js";

// Household actions shared by the Alexa+ MCP tools (tools.ts) and the Fire
// TV buttons (REST routes in index.ts). Voice and remote go through the same
// code path, so "Alexa, check in on Mom" and pressing Check In on the TV
// leave the household in exactly the same state.

export class ActionError extends Error {}

/** Resolves every alert raised for an event and returns the Fire TV to status if it was showing one. */
function resolveAlertsForEvent(eventId: string) {
  const resolved = alerts.filter((a) => a.eventId === eventId && !a.resolved);
  for (const alert of resolved) alert.resolved = true;

  const view = getFireTvView();
  if (view.view === "alert" && resolved.some((a) => a.id === view.alertId)) {
    setFireTvView({ view: "status" });
  }
  return resolved;
}

export function acknowledgeEvent(eventId: string) {
  const event = findEvent(eventId);
  if (!event) throw new ActionError(`No event with id ${eventId}`);
  event.acknowledged = true;
  return { eventId, resolvedAlerts: resolveAlertsForEvent(eventId).map((a) => a.id) };
}

export async function startCheckIn(memberId: string) {
  const member = members.find((m) => m.id === memberId);
  if (!member) throw new ActionError(`No household member with id ${memberId}`);

  const event = await processEvent(
    addEvent({ source: "system", type: "check_in.started", timestamp: new Date().toISOString(), data: { memberId } }),
  );

  // The check-in is the response to any open missed-reminder alert for this
  // member, so those stop asking for attention.
  for (const alert of alerts.filter((a) => !a.resolved)) {
    const cause = findEvent(alert.eventId);
    if (cause?.type === "reminder.missed" && cause.data.memberId === memberId) {
      cause.acknowledged = true;
      resolveAlertsForEvent(cause.id);
    }
  }

  return { member, event };
}

export async function notifyGuardian(eventId: string, message?: string) {
  const cause = findEvent(eventId);
  if (!cause) throw new ActionError(`No event with id ${eventId}`);

  const text = message ?? cause.reasoning ?? `Household event: ${cause.type}`;
  const delivery = await deliverToGuardian(`NEXUS: ${cause.type}`, text);
  const event = await processEvent(
    addEvent({
      source: "system",
      type: "guardian.notified",
      timestamp: new Date().toISOString(),
      data: { eventId, message: text, channel: delivery.channel },
    }),
  );
  return { notified: "guardian", message: text, delivery, event };
}

export function expectVisitor(input: { label: string; windowStart?: string; windowEnd?: string; durationMinutes?: number }) {
  const start = input.windowStart ? new Date(input.windowStart) : new Date();
  const end = input.windowEnd
    ? new Date(input.windowEnd)
    : new Date(start.getTime() + (input.durationMinutes ?? 120) * 60_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ActionError("windowStart/windowEnd must be ISO 8601 timestamps");
  }
  if (end <= start) throw new ActionError("The visitor window must end after it starts");

  return addExpectedVisitor({ label: input.label, windowStart: start.toISOString(), windowEnd: end.toISOString() });
}

/** Handles a button press on the Fire TV alert screen. */
export async function actOnAlert(alertId: string, action: AlertAction) {
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) throw new ActionError(`No alert with id ${alertId}`);
  const cause = findEvent(alert.eventId);

  switch (action) {
    case "check_in": {
      const memberId = cause?.data.memberId;
      if (typeof memberId !== "string") throw new ActionError("This alert isn't about a household member");
      return startCheckIn(memberId);
    }
    case "notify_guardian": {
      const result = await notifyGuardian(alert.eventId);
      acknowledgeEvent(alert.eventId);
      return result;
    }
    case "dismiss":
    case "view":
      return acknowledgeEvent(alert.eventId);
  }
}
