// Drives the demo scenarios against the running NEXUS server so the Fire TV
// UI reacts live. Run: node scripts/demo.mjs <scenario>
//
//   door    unexpected front-door event          → Fire TV alert takeover
//   expect  "Alexa, I'm expecting a package" via the MCP tool, then a doorbell
//           → NEXUS stays quiet and says why on the status screen
//   care    missed medication + inactivity       → check-in offer
//   ai      an event no household rule covers    → Amazon Bedrock decides
//   tools   list the MCP tools Alexa+ sees
//   reset   restore the seeded demo state between takes

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.NEXUS_API_URL ?? "http://localhost:4000";
const TOKEN = process.env.NEXUS_MCP_TOKEN;

async function ring(type, data = {}) {
  const res = await fetch(`${BASE}/webhooks/ring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data }),
  });
  const { event, alert } = await res.json();
  console.log(`${event.type} → ${event.importance} (decided by ${event.decidedBy})`);
  console.log(`  "${event.reasoning}"`);
  console.log(alert ? `  Fire TV: alert takeover "${alert.title}"` : "  Fire TV: no interruption");
}

// Talks to NEXUS over MCP (Streamable HTTP), exactly the way Alexa+ does.
async function withMcp(fn) {
  const client = new Client({ name: "nexus-demo", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : undefined,
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const scenario = process.argv[2] ?? "door";

switch (scenario) {
  case "door":
    await ring("doorbell", { deviceId: "dev-doorbell" });
    break;

  case "expect":
    await withMcp(async (client) => {
      const result = await client.callTool({
        name: "add_expected_visitor",
        arguments: { label: "package delivery", durationMinutes: 120 },
      });
      console.log("MCP add_expected_visitor →", result.content[0].text);
    });
    await ring("doorbell", { deviceId: "dev-doorbell" });
    break;

  case "care":
    await ring("reminder.missed", { memberId: "mem-mom", reminderId: "rem-1" });
    break;

  case "ai":
    // No seeded rule covers a glass-break sensor, so this goes to Bedrock.
    await ring("glass_break", { deviceId: "ring-alarm-kitchen", room: "kitchen", confidence: 0.92 });
    break;

  case "tools":
    await withMcp(async (client) => {
      const { tools } = await client.listTools();
      for (const t of tools) console.log(`${t.name.padEnd(22)} ${t.annotations?.readOnlyHint ? "read" : "write"}`);
    });
    break;

  case "reset": {
    const res = await fetch(`${BASE}/api/reset`, { method: "POST" });
    console.log(await res.json());
    break;
  }

  default:
    console.error(`Unknown scenario "${scenario}". Use door, expect, care, ai, tools, or reset.`);
    process.exit(1);
}
