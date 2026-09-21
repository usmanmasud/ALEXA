import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addEvent,
  alerts,
  devices,
  events,
  expectedVisitors,
  findEvent,
  members,
  reminders,
  rules,
} from "./store.js";
import { processEvent } from "./context-engine.js";
import { setFireTvView } from "./firetv-state.js";
import { computeHomeStatus } from "./home-status.js";

// Every tool NEXUS exposes to Alexa+. Keeping them as small, named verbs
// (rather than one generic "do_anything" tool) is what lets Alexa+ reason
// about which capability to call for a given natural-language request.

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_home_status",
    {
      title: "Get home status",
      description: "Returns the current overall household status: members, devices, pending reminders, and active alerts.",
      inputSchema: {},
    },
    async () => textResult(computeHomeStatus()),
  );

  server.registerTool(
    "get_recent_events",
    {
      title: "Get recent events",
      description: "Returns the most recent household events (door, motion, reminders) with NEXUS's reasoning about each.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    },
    async ({ limit }) => textResult(events.slice(0, limit ?? 10)),
  );

  server.registerTool(
    "get_household_rules",
    {
      title: "Get household rules",
      description: "Returns the configured household rules NEXUS uses to decide what deserves attention.",
      inputSchema: {},
    },
    async () => textResult(rules),
  );

  server.registerTool(
    "get_expected_visitors",
    {
      title: "Get expected visitors",
      description: "Returns visitors currently expected, so door/motion events can be reasoned about correctly.",
      inputSchema: {},
    },
    async () => textResult(expectedVisitors),
  );

  server.registerTool(
    "get_device_status",
    {
      title: "Get device status",
      description: "Returns connectivity/status for household devices (doorbell, displays, sensors).",
      inputSchema: {},
    },
    async () => textResult(devices),
  );

  server.registerTool(
    "show_on_fire_tv",
    {
      title: "Show on Fire TV",
      description: "Pushes a view (home status or a specific alert) to the household's Fire TV display.",
      inputSchema: {
        view: z.enum(["status", "alert"]),
        alertId: z.string().optional(),
      },
    },
    async ({ view, alertId }) => {
      // The web app polls /api/firetv-view; this just records the desired
      // view so the dashboard picks it up. See apps/web for the display.
      setFireTvView({ view, alertId });
      return textResult({ ok: true, view, alertId });
    },
  );

  server.registerTool(
    "create_reminder",
    {
      title: "Create reminder",
      description: "Creates a household reminder for a member.",
      inputSchema: {
        memberId: z.string(),
        label: z.string(),
        dueAt: z.string().describe("ISO 8601 timestamp"),
      },
    },
    async ({ memberId, label, dueAt }) => {
      const reminder = { id: crypto.randomUUID(), memberId, label, dueAt, acknowledged: false };
      reminders.push(reminder);
      return textResult(reminder);
    },
  );

  server.registerTool(
    "start_check_in",
    {
      title: "Start check-in",
      description: "Starts a check-in flow with a household member (e.g. after a missed reminder and no activity).",
      inputSchema: { memberId: z.string() },
    },
    async ({ memberId }) => {
      const member = members.find((m) => m.id === memberId);
      const event = await processEvent(
        addEvent({
          source: "system",
          type: "check_in.started",
          timestamp: new Date().toISOString(),
          data: { memberId },
        }),
      );
      return textResult({ ok: true, member, event });
    },
  );

  server.registerTool(
    "notify_guardian",
    {
      title: "Notify guardian",
      description: "Sends a notification to the household guardian about an event.",
      inputSchema: { eventId: z.string(), message: z.string().optional() },
    },
    async ({ eventId, message }) => {
      const event = findEvent(eventId);
      return textResult({ ok: true, notified: "guardian", event, message: message ?? event?.reasoning });
    },
  );

  server.registerTool(
    "acknowledge_event",
    {
      title: "Acknowledge event",
      description: "Marks an event/alert as acknowledged so it stops requesting attention.",
      inputSchema: { eventId: z.string() },
    },
    async ({ eventId }) => {
      const event = findEvent(eventId);
      if (event) event.acknowledged = true;
      const alert = alerts.find((a) => a.eventId === eventId);
      if (alert) alert.resolved = true;
      return textResult({ ok: true, eventId });
    },
  );
}
