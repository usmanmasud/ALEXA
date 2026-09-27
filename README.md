# NEXUS — the proactive AI layer for the home

**License: MIT** (see [LICENSE](./LICENSE))

> Alexa hears you. Ring sees what happens. Fire TV shows you. NEXUS decides what matters.

A smart home produces a steady stream of doorbells, motion pings and reminders, and treats
every one as equally urgent. NEXUS is a household context engine, exposed to **Alexa+ as a
self-hosted MCP server**, that decides whether each event deserves a human's attention and
explains why. Some events it handles quietly. Others take over the living-room **Fire TV**,
where they can be resolved with the remote or by voice.

Built for the [Amazon Developer Hackathon](https://amazon-developer.devpost.com/).

- **Primary track:** Alexa+ (self-hosted MCP server, Streamable HTTP, protocol `2025-11-25`)
- **Mini challenges:** AWS Builder (Amazon Bedrock, Amazon SNS), Open Source

## What it does

| You say / something happens | NEXUS decides | You see |
|---|---|---|
| Doorbell rings at 2pm, nobody expected | Worth a look, not urgent (household rule) | Fire TV alert: *Someone is at the front door*, with **Why?** / **Dismiss** |
| *"Alexa, I'm expecting a package this afternoon"*, then the doorbell rings | Expected, so nobody is interrupted | Status screen: *Doorbell · expected package delivery, handled quietly* |
| Mom misses her evening medication, no activity for 90+ minutes | Care risk | Fire TV: *Check-in suggested*, with **Check In** / **Notify Guardian** (sent through SNS) |
| Motion at the front door at 2am | Critical | Alert with **Notify Guardian** |
| Something no rule covers, e.g. a glass-break sensor | Claude on **Amazon Bedrock** reasons over the household context | Its decision and one-sentence reason, labelled *decided by Amazon Bedrock* |

Every decision records **what made it**: a named household rule, Bedrock, or the fail-safe
default. The TV shows this, so NEXUS is never a black box. If Bedrock can't be reached, an
event NEXUS can't assess is **shown, not dropped**. Staying quiet is always a decision with a
reason.

Voice and remote run **the same code path** ([`actions.ts`](apps/mcp-server/src/actions.ts)).
Pressing **Check In** on the TV or saying *"Alexa, check in on Mom"* leaves the household
in the same state, and the TV updates either way.

## Architecture

```
  Alexa+ ──MCP (Streamable HTTP)──► apps/mcp-server ◄── Ring events (POST /webhooks/ring)
                                        │
                     tools.ts ──► actions.ts ──► context-engine.ts ──► household rules
                                        │                    └──────► Amazon Bedrock (Claude)
                                        │                               for events no rule covers
                                        ├──► notifier.ts ──► Amazon SNS (guardian SMS/email)
                                        └──► store.ts (household state)
                                                  ▲
  apps/web (Fire TV kiosk, D-pad UI) ──REST───────┘
```

## MCP tools (what Alexa+ sees)

| Tool | Kind | Purpose |
|---|---|---|
| `get_home_status` | read | Members, devices, pending reminders, active alerts |
| `get_recent_events` | read | Recent events with NEXUS's reasoning and what decided each one |
| `get_household_rules` | read | The rules the context engine applies |
| `get_expected_visitors` | read | Current expected-visitor windows |
| `get_device_status` | read | Doorbell / display connectivity |
| `add_expected_visitor` | write | *"I'm expecting a package"*: stops alerts for front-door activity in that window |
| `show_on_fire_tv` | write | Show the status screen or a specific alert on the TV |
| `create_reminder` | write | Create a reminder for a household member |
| `start_check_in` | write | Start a check-in; resolves that member's missed-reminder alerts |
| `notify_guardian` | write | Notify the guardian about an event (Amazon SNS when configured) |
| `acknowledge_event` | write | Mark an event handled and clear it from the TV |

Tools carry MCP annotations (`readOnlyHint`, `idempotentHint`, `openWorldHint`) and return
MCP tool errors (`isError`) for unknown IDs or invalid time windows, so the assistant can
recover instead of guessing.

## Run it (about 2 minutes)

Requires Node.js 18.17+.

```bash
npm install
npm run build -w packages/shared
npm test                # context-engine and action tests

# terminal 1
npm run dev:mcp         # NEXUS MCP server + REST on http://localhost:4000

# terminal 2
npm run dev:web         # Fire TV kiosk UI on http://localhost:3000
```

Then drive the scenarios (terminal 3). The TV updates within about 1.5 seconds:

```bash
node scripts/demo.mjs door     # unexpected visitor → alert takeover
node scripts/demo.mjs expect   # add_expected_visitor over MCP, then doorbell → handled quietly
node scripts/demo.mjs care     # missed medication → check-in offer
node scripts/demo.mjs ai       # glass-break sensor, no rule → Amazon Bedrock decides
node scripts/demo.mjs tools    # list the MCP tools over Streamable HTTP
node scripts/demo.mjs reset    # restore seeded state between takes
```

On the TV, use the arrow keys (the Fire TV D-pad) to move between actions, Enter to select,
and Esc/Back to close details or dismiss.

### Running on a Fire TV

Open the kiosk URL (`http://<your-computer's-LAN-IP>:3000`) in the Silk browser on the Fire
TV, and build the web app with `NEXUS_API_URL=http://<LAN-IP>:4000` so the TV can reach the
server.

### Connecting Alexa+

Alexa+ needs to reach `/mcp` over HTTPS. For development, run the server behind a tunnel,
for example `cloudflared tunnel --url http://localhost:4000`. Set `NEXUS_MCP_TOKEN` in
`apps/mcp-server/.env`, then register `https://<tunnel-host>/mcp` with that bearer token as
a self-hosted MCP server, following the Alexa+ developer documentation. Any MCP client that supports
Streamable HTTP works the same way; `scripts/demo.mjs` is one.

### AWS setup (optional; everything works without it)

Copy `apps/mcp-server/.env.example` to `.env` and fill in:

- **Amazon Bedrock**: `AWS_REGION`, standard AWS credentials, and Claude model access
  enabled in the Bedrock console. `BEDROCK_MODEL_ID` defaults to `anthropic.claude-opus-5`.
- **Amazon SNS**: `NEXUS_GUARDIAN_SNS_TOPIC_ARN`, a topic with the guardian's phone number
  or email subscribed to it.

Without credentials, Bedrock and SNS fail safe (see above) and log to the console.

## AWS integrations

| Service | Where | What it does |
|---|---|---|
| Amazon Bedrock (Claude, via Anthropic's Bedrock SDK) | [`bedrock-reasoner.ts`](apps/mcp-server/src/bedrock-reasoner.ts) | Assesses events no household rule covers, using household context (local time, members, rules, expected visitors, recent events). Structured outputs guarantee a schema-valid decision. |
| Amazon SNS | [`notifier.ts`](apps/mcp-server/src/notifier.ts) | Delivers guardian notifications from the `notify_guardian` tool and the TV's **Notify Guardian** button |

## Repo layout

```
apps/mcp-server/   Alexa+ MCP server, context engine, actions, Bedrock + SNS, Ring webhook
apps/web/          Fire TV kiosk UI (status screen + D-pad alert takeover)
packages/shared/   Domain types shared by server and UI
scripts/demo.mjs   Demo driver (Ring events + a real MCP client)
docs/BLUEPRINT.md  Architecture, design decisions, roadmap
```

## Design system

Two colors, used consistently: near-black **ink** as the entire surface, and a single
amber **signal** accent for everything interactive or attention-worthy. Focus on the TV is
full signal and scaled up so it's readable from the couch. See
[`globals.css`](apps/web/src/app/globals.css).

## What's simulated

Ring events arrive through a documented webhook (`POST /webhooks/ring`) instead of a paired
Ring device; the rules allow this. Household state is in memory and resets on restart or
with `demo.mjs reset`.
