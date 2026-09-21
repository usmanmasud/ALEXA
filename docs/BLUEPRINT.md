# NEXUS — Technical Blueprint

Amazon Developer Hackathon · Primary track: **Alexa+** · Mini challenges: **AWS Builder**, **Open Source**
Deadline: Oct 23, 2026 @ 8:00pm GMT+1 — plan assumes a start date around Sep 20, 2026 (~40 days).

This document is the single source of truth for scope, architecture, and schedule.
Code in this repo is the reference implementation of the parts marked **[built]** below;
everything else is **[planned]** and sequenced into the schedule.

---

## 1. The pitch, in one paragraph

Modern homes generate dozens of notifications a day (motion, doorbells, reminders,
device pings) and treat every one as equally urgent. NEXUS is a household context
engine, exposed to Alexa+ as an MCP server, that decides which events actually
deserve a human's attention — combining them with time of day, household rules,
expected-visitor windows, and inactivity patterns — and only then surfaces them,
through the right device (Fire TV for visual alerts, Alexa+ for voice/action). It
turns "silent problems" (a missed medication reminder, a door opened at 2am, an
unacknowledged event) into something a household actually sees and can act on.

## 2. What we will NOT build

Forty days is enough for three spectacular flows, not thirty mediocre features.
Explicitly out of scope for the submission:

- Real Ring hardware pairing (a documented webhook simulator stands in — allowed
  per the rules: "a physical Ring device is not required")
- A general-purpose chatbot / open-ended assistant UI
- Multi-household / multi-tenant support
- Native Fire OS/Vega app packaging (the Fire TV surface is a web kiosk view,
  which satisfies the Alexa+/Ring tracks; a native Fire TV app is a stretch goal
  only if time remains, since Fire TV itself is a separate primary track we are
  not entering)
- Authentication/multi-user accounts (single demo household, seeded state)

## 3. Architecture

```
                 ┌────────────────────┐
                 │   Alexa+ (voice)    │
                 └──────────┬──────────┘
                            │  MCP (Streamable HTTP, 2025-11-25+)
                            ▼
                 ┌────────────────────┐        ┌──────────────────────┐
                 │  apps/mcp-server   │◄──────►│  AWS Bedrock /        │
                 │  - MCP tools       │        │  AgentCore (planned)  │
                 │  - context-engine  │        └──────────────────────┘
                 │  - REST for UI     │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼───────────────┐
             ▼               ▼               ▼
     Ring webhook      household store   Fire TV kiosk UI
     (simulated;       (in-memory now,   (apps/web, polls
     real Ring API     DynamoDB planned) REST endpoints)
     is a drop-in
     replacement)
```

**[built]** `apps/mcp-server` — Express + `@modelcontextprotocol/sdk`, Streamable
HTTP transport at `/mcp`, in-memory household store, rule-based context engine,
simulated Ring webhook at `/webhooks/ring`, REST endpoints for the UI.

**[built]** `apps/web` — Next.js kiosk view that polls the server and switches
between a calm status screen and a full-screen alert takeover.

**[built]** Amazon Bedrock (`apps/mcp-server/src/bedrock-reasoner.ts`) via
`@aws-sdk/client-bedrock-runtime`'s `ConverseCommand`. Only events that fall
through every seeded rule reach Bedrock — the rule-based engine stays the
primary, always-available path so a demo never depends on a live model call
succeeding. If `AWS_REGION`/model access isn't configured, or the call fails
for any reason, `reasonWithBedrock` returns `null` and `assessEvent` falls
back to a static default — a real integration that fails safe, not a mock.

**[planned]** AgentCore for multi-step tool orchestration beyond the current
single-shot reasoning call, if time remains.

**[planned]** DynamoDB-backed store implementing the same interface as
`store.ts`, so swapping it in touches no other file.

## 4. MCP tools (Alexa+ surface)

All **[built]** in `apps/mcp-server/src/tools.ts`, registered on a single
`McpServer` instance:

| Tool | Purpose |
|---|---|
| `get_home_status` | Overall status: members, devices, pending reminders, active alerts |
| `get_recent_events` | Recent events with NEXUS's reasoning attached |
| `get_household_rules` | The rules the context engine evaluates against |
| `get_expected_visitors` | Visitor windows, used to suppress false-positive door alerts |
| `get_device_status` | Doorbell/display/sensor connectivity |
| `show_on_fire_tv` | Pushes a view (status or a specific alert) to the Fire TV kiosk |
| `create_reminder` | Creates a household reminder |
| `start_check_in` | Starts a check-in flow for a member |
| `notify_guardian` | Notifies the household guardian about an event |
| `acknowledge_event` | Marks an event/alert resolved |

## 5. AWS Builder mini challenge — real usage, not a logo

Status per service, each with a concrete "before/after" for the product feedback
answer the submission requires:

- **Amazon Bedrock** — **[built]**. Reasoning fallback for events that don't
  match a seeded rule (open-ended: "is this worth attention, and why?").
  Called from `bedrock-reasoner.ts`, behind `context-engine.ts`'s
  `assessEvent()` interface — the rest of the codebase doesn't know or care
  whether an assessment came from a rule or a model call.
- **DynamoDB** — **[planned]**. Household state (see schema below), replacing `store.ts`'s
  in-memory maps.
- **Lambda** — the real Ring webhook receiver in front of the context engine
  (API Gateway → Lambda → same `processEvent()` logic, containerized or ported).
- **API Gateway** — public endpoint for the Ring webhook and the MCP server if
  deployed off a local machine for judging.
- **CloudWatch** — logging for event processing and alert delivery, so the
  "friction log" entries about AWS onboarding are backed by real logs.

### DynamoDB schema (single-table design)

| PK | SK | Attributes | Notes |
|---|---|---|---|
| `HOUSEHOLD#<id>` | `META` | name, timezone | one row per household |
| `HOUSEHOLD#<id>` | `MEMBER#<id>` | name, role, needsCheckIn | |
| `HOUSEHOLD#<id>` | `DEVICE#<id>` | name, kind, online, lastSeen | |
| `HOUSEHOLD#<id>` | `RULE#<id>` | description, condition, action | |
| `HOUSEHOLD#<id>` | `EVENT#<ISO-timestamp>#<id>` | source, type, data, importance, reasoning | sort key enables time-range queries |
| `HOUSEHOLD#<id>` | `ALERT#<id>` | eventId, title, message, severity, resolved | |
| `HOUSEHOLD#<id>` | `REMINDER#<id>` | memberId, label, dueAt, acknowledged | |

GSI1 (`GSI1PK = HOUSEHOLD#<id>#ALERTS`, `GSI1SK = resolved#createdAt`) supports
"active alerts" queries directly instead of scanning.

## 6. Fire TV UI screens

**[built]**, `apps/web`:

- **Status screen** (`components/StatusScreen.tsx`) — "All systems normal" or
  "Needs your attention", with per-row status (Front Door / Family / Reminders).
- **Alert takeover** (`components/AlertScreen.tsx`) — full-screen, high-contrast,
  with the reasoning sentence and action buttons (`View`, `Dismiss`, `Check In`,
  `Notify Guardian`) that call back into the MCP tools via the REST layer.

Design system: two colors only (`ink` background, `signal` amber accent), see
`apps/web/src/app/globals.css`. Neutrals (white/gray text) carry no meaning on
their own — every status/alert distinction is communicated through the signal
color's intensity, not a new hue, so the brand stays consistent across both
screens and any future surface (web dashboard, Alexa+ visual response, etc.).

## 7. 40-day build schedule

| Days | Phase | Deliverable |
|---|---|---|
| 1–3 | Architecture & setup | This repo, seeded domain model, Alexa+/Ring/AWS account setup — **done** |
| 4–9 | MCP server | All 10 tools, Streamable HTTP transport, in-memory store — **done** |
| 10–14 | Context engine | Rule-based reasoning for the 3 MVP flows — **done** |
| 15–18 | Fire TV UI | Status + alert screens, polling, two-color design system — **done** |
| 19–23 | Device integration | Real Ring webhook subscription (replace simulator), verify against a live/sandbox Ring account |
| 24–28 | AWS deployment | Bedrock fallback reasoning — **done**; DynamoDB store swap-in, Lambda + API Gateway for the webhook |
| 29–31 | Alexa+ verification | Confirm MCP server works against actual Alexa+ Preview, fix protocol edge cases |
| 32–34 | Open-source packaging | README polish, CONTRIBUTING.md, a real external contribution (PR to a public MCP-related repo) for the Open Source mini challenge |
| 35–37 | Demo video | Script, record, edit to under 3 minutes |
| 38–39 | Friction log + feedback | Document real SDK/API onboarding issues (up to 10% judging bonus) |
| 40 | Submission | Devpost write-up, final repo check, submit |

## 8. Demo script (≤ 3 minutes)

| Time | Beat |
|---|---|
| 0:00–0:15 | Hook: "Most smart homes can tell you what happened. NEXUS understands what matters." |
| 0:15–0:45 | Scenario 1 — unexpected front-door event: Ring → NEXUS reasoning → Alexa+ voice → Fire TV alert takeover |
| 0:45–1:20 | Scenario 2 — care check: missed reminder + inactivity → proactive check-in offer |
| 1:20–1:50 | Alexa+ MCP: show the `/mcp` Streamable HTTP call, a natural-language request resolving to a tool call |
| 1:50–2:20 | AWS: Bedrock/DynamoDB/Lambda architecture, one sentence on why context (not per-event reasoning) needs it |
| 2:20–2:45 | Vision: Alexa+ / Ring / Fire TV converging into one household agent |
| 2:45–3:00 | Close: "NEXUS — the proactive AI layer for the home." |

`scripts/demo.mjs` reproduces scenarios 1 and 2 against the running server for
recording.

## 9. Submission checklist (from the official rules)

- [ ] Public GitHub repo, MIT license visible in the About section
- [ ] Text description of what it does and how it works
- [ ] Repo actually calls the Alexa+ MCP spec in code (not just mentioned) — **satisfied**, `apps/mcp-server`
- [ ] Demo video ≤ 3 minutes, public, in English, best material first
- [ ] Product feedback on every tool/API/SDK used, including AWS services specifically
- [ ] Track + mini challenge selection stated explicitly (Alexa+ primary; AWS Builder, Open Source minis)
- [ ] Open Source mini: contribution URL, repo URL, GitHub username, description
- [ ] AWS Builder mini: documented integrations (see §5)
- [ ] Optional friction log entries (severity, workaround, suggestion) for up to 10% bonus
- [ ] Statement that all listed work was done during the submission window
