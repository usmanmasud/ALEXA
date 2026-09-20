import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createNexusServer } from "./server-factory.js";
import { addEvent, alerts, events } from "./store.js";
import { processEvent } from "./context-engine.js";
import { getFireTvView, setFireTvView } from "./firetv-state.js";
import { computeHomeStatus } from "./home-status.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());

// --- Alexa+ MCP endpoint (Streamable HTTP, spec 2025-11-25+) ---------------

const transports: Record<string, StreamableHTTPServerTransport> = {};

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
  res.json({ ...fireTvView, alert });
});

app.post("/api/acknowledge/:alertId", (req, res) => {
  const alert = alerts.find((a) => a.id === req.params.alertId);
  if (alert) alert.resolved = true;
  setFireTvView({ view: "status" });
  res.json({ ok: true });
});

// --- Simulated Ring webhook --------------------------------------------
// Stands in for a real Ring device/webhook subscription during judging.
// Swap for Ring's actual event webhook without touching the context engine.

app.post("/webhooks/ring", (req, res) => {
  const { type = "motion", data = {} } = req.body ?? {};
  const event = processEvent(
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
  console.log(`  MCP endpoint:      POST/GET/DELETE http://localhost:${PORT}/mcp`);
  console.log(`  Home status:       GET  http://localhost:${PORT}/api/home-status`);
  console.log(`  Ring webhook sim:  POST http://localhost:${PORT}/webhooks/ring`);
});
