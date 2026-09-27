import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createNexusServer } from "./server-factory.js";
import type { AlertAction } from "@nexus/shared";
import { addEvent, alerts, events, findEvent, resetHousehold } from "./store.js";
import { processEvent } from "./context-engine.js";
import { getFireTvView, setFireTvView } from "./firetv-state.js";
import { computeHomeStatus } from "./home-status.js";
import { ActionError, actOnAlert } from "./actions.js";

const PORT = Number(process.env.PORT ?? 4000);
// Optional shared secret for /mcp. Set it whenever the server is reachable
// from the internet (e.g. through a tunnel for Alexa+), and give the same
// value to the MCP client as a bearer token.
const MCP_TOKEN = process.env.NEXUS_MCP_TOKEN;

const app = express();
app.use(cors());
app.use(express.json());

// --- Alexa+ MCP endpoint (Streamable HTTP, spec 2025-11-25+) ---------------

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.use("/mcp", (req, res, next) => {
  if (!MCP_TOKEN || req.headers.authorization === `Bearer ${MCP_TOKEN}`) return next();
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
});

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports[sessionId] : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport!;
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) delete transports[transport.sessionId];
    };
    const server = createNexusServer();
    await server.connect(transport);
  } else if (!transport) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session / not an initialize request" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(req: express.Request, res: express.Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

// --- REST surface for the Fire TV / dashboard UI ---------------------------

app.get("/api/home-status", (_req, res) => {
  res.json(computeHomeStatus());
});

app.get("/api/events", (_req, res) => {
  res.json(events.slice(0, 20));
});

app.get("/api/firetv-view", (_req, res) => {
  const fireTvView = getFireTvView();
  const alert = fireTvView.alertId ? alerts.find((a) => a.id === fireTvView.alertId) : undefined;
  const event = alert ? findEvent(alert.eventId) : undefined;
  res.json({ ...fireTvView, alert, event });
});

const ALERT_ACTIONS: AlertAction[] = ["view", "dismiss", "check_in", "notify_guardian"];

// Fire TV button presses. Runs the same household actions as the MCP tools.
app.post("/api/alerts/:alertId/actions/:action", async (req, res) => {
  const action = req.params.action as AlertAction;
  if (!ALERT_ACTIONS.includes(action)) {
    res.status(400).json({ error: `Unknown action ${action}` });
    return;
  }
  try {
    res.json({ ok: true, result: await actOnAlert(req.params.alertId, action) });
  } catch (err) {
    if (!(err instanceof ActionError)) throw err;
    res.status(404).json({ error: err.message });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Resets in-memory demo state without restarting the process — for retakes
// while recording the submission video.
app.post("/api/reset", (_req, res) => {
  resetHousehold();
  setFireTvView({ view: "status" });
  res.json({ ok: true });
});

// --- Simulated Ring webhook --------------------------------------------
// Stands in for a real Ring device/webhook subscription during judging.
// Swap for Ring's actual event webhook without touching the context engine.

app.post("/webhooks/ring", async (req, res) => {
  const { type = "motion", data = {} } = req.body ?? {};
  if (typeof type !== "string" || typeof data !== "object" || data === null) {
    res.status(400).json({ error: "Body must be { type: string, data?: object }" });
    return;
  }
  const event = await processEvent(
    addEvent({
      source: "ring",
      type,
      timestamp: new Date().toISOString(),
      data,
    }),
  );

  const alert = alerts.find((a) => a.eventId === event.id);
  if (alert) setFireTvView({ view: "alert", alertId: alert.id });

  res.json({ event, alert });
});

app.listen(PORT, () => {
  console.log(`NEXUS MCP server listening on http://localhost:${PORT}`);
  console.log(`  MCP endpoint:      POST/GET/DELETE http://localhost:${PORT}/mcp${MCP_TOKEN ? " (bearer token required)" : ""}`);
  console.log(`  Home status:       GET  http://localhost:${PORT}/api/home-status`);
  console.log(`  Ring webhook sim:  POST http://localhost:${PORT}/webhooks/ring`);
});
