# NEXUS — the proactive AI layer for the home

**License: MIT** (see [LICENSE](./LICENSE))

> Alexa hears you. Ring sees what happens. Fire TV shows you. NEXUS connects the dots.

Most smart-home systems can tell you what happened. NEXUS decides what *matters* —
turning disconnected Ring/Alexa+/Fire TV events into contextual assistance instead
of a stream of raw notifications. Built for the [Amazon Developer Hackathon](https://amazon-developer.devpost.com/).

- **Primary track:** Alexa+ (self-hosted MCP server, Streamable HTTP, spec 2025-11-25+)
- **Mini challenges:** AWS Builder, Open Source

Full technical blueprint (architecture, AWS design, schema, 40-day schedule, demo
script, submission strategy): [docs/BLUEPRINT.md](./docs/BLUEPRINT.md)

## What it does

NEXUS is a household context engine exposed to Alexa+ over MCP. When a Ring event,
a missed reminder, or an inactivity gap comes in, NEXUS reasons about whether it's
actually worth a human's attention — using household rules, expected-visitor
windows, and time of day — before deciding to interrupt anyone. When it does,
Fire TV becomes the visual surface (doorbell alerts, care check-ins, restricted-hours
notices), and Alexa+ can act on natural-language follow-ups ("tell the delivery guy
to leave it at the door").

Three flows make up the MVP:

1. **Contextual door event** — Ring → NEXUS context engine → Alexa+ notification → Fire TV alert takeover
2. **Care check** — missed reminder + no follow-up activity → proactive check-in offer
3. **Natural-language home control** — Alexa+ → MCP tool call → Fire TV confirms the result

## Architecture

```
        Alexa+ (voice)                    Ring (real device or simulated webhook)
             │                                          │
             ▼                                          ▼
   apps/mcp-server  ── MCP tools ──►  context-engine.ts (reasoning: what matters?)
   (Streamable HTTP, /mcp)                              │
             │                                          ▼
             │                                   store.ts (household state)
             ▼                                          │
   apps/web  (Fire TV kiosk UI, polls /api/*) ◄─────────┘
```

## Repo layout

```
apps/
  mcp-server/   Alexa+ MCP server (Streamable HTTP) + context engine + Ring webhook sim
  web/          Fire TV kiosk UI (status screen / alert takeover), two-color design system
packages/
  shared/       Domain types shared by the server and the UI
docs/
  BLUEPRINT.md  Full architecture, AWS plan, schema, build schedule, demo script
scripts/
  demo.mjs      Fires the two scripted demo scenarios at the running server
```

## Running it locally

Requires Node.js 18.17+.

```bash
npm install
npm run build -w packages/shared

# terminal 1
npm run dev:mcp     # NEXUS MCP server + REST API on http://localhost:4000

# terminal 2
npm run dev:web     # Fire TV kiosk UI on http://localhost:3000
```

Trigger the demo scenarios against the running server:

```bash
node scripts/demo.mjs door   # unexpected front-door event → Fire TV alert takeover
node scripts/demo.mjs care   # missed reminder + inactivity → check-in offer
```

Point an MCP-compatible client (or Alexa+ in Preview) at `http://localhost:4000/mcp`
to call the tools directly (`get_home_status`, `create_reminder`, `start_check_in`, …).

## Design system

Two colors, used consistently everywhere: near-black **ink** as the entire surface,
and a single amber **signal** accent for every interactive or attention-worthy
element (dimmer for "steady", full intensity for "alert"). See
[`apps/web/src/app/globals.css`](./apps/web/src/app/globals.css).

## Status

Hackathon build in progress — see [docs/BLUEPRINT.md](./docs/BLUEPRINT.md) for the
phase-by-phase plan and what's mocked vs. real.
