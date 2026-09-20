// Fires the two scripted scenarios from the demo at the running MCP server,
// so the Fire TV UI reacts live. Run: node scripts/demo.mjs door
// or:                                  node scripts/demo.mjs care

const BASE = process.env.NEXUS_API_URL ?? "http://localhost:4000";

async function ring(type, data = {}) {
  const res = await fetch(`${BASE}/webhooks/ring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data }),
  });
  console.log(await res.json());
}

const scenario = process.argv[2] ?? "door";

if (scenario === "door") {
  // Unexpected front-door motion, no visitor on record.
  await ring("doorbell", { deviceId: "dev-doorbell" });
} else if (scenario === "care") {
  // Simulates a missed medication reminder with no follow-up activity.
  await ring("reminder.missed", { memberId: "mem-mom", reminderId: "rem-1" });
} else {
  console.error(`Unknown scenario "${scenario}". Use "door" or "care".`);
  process.exit(1);
}
