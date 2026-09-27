import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { alerts, devices, events, expectedVisitors, members, reminders, rules } from "./store.js";
import { setFireTvView } from "./firetv-state.js";
import { computeHomeStatus } from "./home-status.js";
import { ActionError, acknowledgeEvent, expectVisitor, notifyGuardian, startCheckIn } from "./actions.js";

// Every tool NEXUS exposes to Alexa+. Keeping them as small, named verbs
// (rather than one generic "do_anything" tool) is what lets Alexa+ reason
// about which capability to call for a given natural-language request.
// Annotations tell the client which calls are safe reads and which change
// household state.

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Turns an ActionError (bad id, bad window) into a tool error the model can recover from. */
async function run(fn: () => unknown) {
  try {
    return textResult(await fn());
  } catch (err) {
    if (err instanceof ActionError) return errorResult(err.message);
    throw err;
  }
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITES = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_home_status",
    {
      title: "Get home status",
      description:
        "Returns the current overall household status: members, devices, pending reminders, and active alerts. Use this for questions like 'is everything okay at home?'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => textResult(computeHomeStatus()),
  );

  server.registerTool(
    "get_recent_events",
    {
      title: "Get recent events",
      description:
        "Returns the most recent household events (door, motion, reminders), each with NEXUS's reasoning and what decided it (a household rule or Amazon Bedrock). Use this for 'what happened while I was out?' or 'why didn't you tell me about the doorbell?'.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      annotations: READ_ONLY,
    },
    async ({ limit }) => textResult(events.slice(0, limit ?? 10)),
  );

  server.registerTool(
    "get_household_rules",
    {
      title: "Get household rules",
      description: "Returns the configured household rules NEXUS uses to decide what deserves attention.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => textResult(rules),
  );

  server.registerTool(
    "get_expected_visitors",
    {
      title: "Get expected visitors",
      description: "Returns visitors currently expected. Front-door activity inside one of these windows doesn't interrupt anyone.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => textResult(expectedVisitors),
  );

  server.registerTool(
    "add_expected_visitor",
    {
      title: "Add expected visitor",
      description:
        "Tells NEXUS someone is expected at the front door (a delivery, a guest, a carer), so doorbell and motion events in that window are logged quietly instead of interrupting the household. Use for 'I'm expecting a package this afternoon'. Give either an explicit window or a duration starting now.",
      inputSchema: {
        label: z.string().describe("Who or what is expected, e.g. 'package delivery' or 'Aunt Sarah'"),
        windowStart: z.string().optional().describe("ISO 8601 start of the window; defaults to now"),
        windowEnd: z.string().optional().describe("ISO 8601 end of the window"),
        durationMinutes: z
          .number()
          .int()
          .min(5)
          .max(24 * 60)
          .optional()
          .describe("Window length when windowEnd isn't given; defaults to 120"),
      },
      annotations: WRITES,
    },
    async (input) => run(() => expectVisitor(input)),
  );

  server.registerTool(
    "get_device_status",
    {
      title: "Get device status",
      description: "Returns connectivity/status for household devices (doorbell, displays, sensors).",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => textResult(devices),
  );

  server.registerTool(
    "show_on_fire_tv",
    {
      title: "Show on Fire TV",
      description:
        "Pushes a view to the living-room Fire TV: the home status screen, or a specific active alert (pass its alertId from get_home_status).",
      inputSchema: {
        view: z.enum(["status", "alert"]),
        alertId: z.string().optional(),
      },
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ view, alertId }) => {
      if (view === "alert") {
        const alert = alerts.find((a) => a.id === alertId && !a.resolved);
        if (!alert) return errorResult("view 'alert' needs the alertId of an active alert (see get_home_status)");
      }
      // The web app polls /api/firetv-view; this just records the desired
      // view so the Fire TV picks it up. See apps/web for the display.
      setFireTvView({ view, alertId: view === "alert" ? alertId : undefined });
      return textResult({ ok: true, view, alertId });
    },
  );

  server.registerTool(
    "create_reminder",
    {
      title: "Create reminder",
      description:
        "Creates a household reminder for a member. If a member who needs check-ins misses it, NEXUS offers a check-in on the Fire TV.",
      inputSchema: {
        memberId: z.string().describe(`One of: ${members.map((m) => `${m.id} (${m.name})`).join(", ")}`),
        label: z.string(),
        dueAt: z.string().describe("ISO 8601 timestamp"),
      },
      annotations: WRITES,
    },
    async ({ memberId, label, dueAt }) => {
      if (!members.some((m) => m.id === memberId)) return errorResult(`No household member with id ${memberId}`);
      if (Number.isNaN(new Date(dueAt).getTime())) return errorResult("dueAt must be an ISO 8601 timestamp");
      const reminder = { id: randomUUID(), memberId, label, dueAt, acknowledged: false };
      reminders.push(reminder);
      return textResult(reminder);
    },
  );

  server.registerTool(
    "start_check_in",
    {
      title: "Start check-in",
      description:
        "Starts a check-in with a household member (e.g. after a missed medication reminder and no activity). Resolves that member's missed-reminder alerts.",
      inputSchema: {
        memberId: z.string().describe(`One of: ${members.map((m) => `${m.id} (${m.name})`).join(", ")}`),
      },
      annotations: WRITES,
    },
    async ({ memberId }) => run(() => startCheckIn(memberId)),
  );

  server.registerTool(
    "notify_guardian",
    {
      title: "Notify guardian",
      description:
        "Sends a notification about an event to the household guardian (via Amazon SNS when configured). Use the eventId from get_recent_events or an alert.",
      inputSchema: { eventId: z.string(), message: z.string().optional() },
      annotations: { ...WRITES, openWorldHint: true },
    },
    async ({ eventId, message }) => run(() => notifyGuardian(eventId, message)),
  );

  server.registerTool(
    "acknowledge_event",
    {
      title: "Acknowledge event",
      description:
        "Marks an event as handled so its alert stops requesting attention, and clears it from the Fire TV. Use for 'I've got it' or 'dismiss the doorbell alert'.",
      inputSchema: { eventId: z.string() },
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ eventId }) => run(() => acknowledgeEvent(eventId)),
  );
}
