# NEXUS — Technical Blueprint

Amazon Developer Hackathon · Primary track: **Alexa+** · Mini challenges: **AWS Builder**, **Open Source**
Deadline: Oct 23, 2026 @ 8:00pm GMT+1. Work started Sep 20, 2026, inside the submission window.

Everything marked **[built]** exists in this repo and is covered by `npm test` or
`scripts/demo.mjs`. Everything marked **[planned]** does not exist yet.

---

## 1. The pitch, in one paragraph

Modern homes generate dozens of notifications a day (motion, doorbells, reminders,
device pings) and treat every one as equally urgent. NEXUS is a household context
engine, exposed to Alexa+ as an MCP server, that decides which events actually
deserve a human's attention. It combines each event with time of day, household
rules, expected-visitor windows and recent activity, and only then surfaces it
through the right device: Fire TV for visual alerts, Alexa+ for voice and action.
It turns silent problems (a missed medication reminder, a door opened at 2am) into
something a household sees and can act on, and it turns expected noise (the
delivery you told Alexa about) into nothing.

## 2. Out of scope for the submission

- Real Ring hardware pairing. A documented webhook stands in, which the rules allow
  ("a physical Ring device is not required").
- A general-purpose chatbot UI.
- Multi-household / multi-tenant support and user accounts.
- A native Fire OS / Vega app. The Fire TV surface is a web kiosk in the Silk browser;
  Fire TV is a separate primary track we are not entering.

## 3. Architecture

```
  Alexa+ ──MCP (Streamable HTTP, 2025-11-25)──► apps/mcp-server
                                                  │
     tools.ts (11 MCP tools) ──► actions.ts ◄── REST routes ◄── apps/web (Fire TV kiosk)
                                     │
                                     ├──► context-engine.ts ──► household rules (primary)
                                     │                    └───► bedrock-reasoner.ts ──► Amazon Bedrock
                                     ├──► notifier.ts ──► Amazon SNS
                                     └──► store.ts (in-memory household state)
  Ring events ──► POST /webhooks/ring ──► context-engine.ts
```

**[built]** `apps/mcp-server`: Express + `@modelcontextprotocol/sdk` 1.30,
Streamable HTTP at `/mcp` with per-session transports, optional bearer-token auth
(`NEXUS_MCP_TOKEN`) for exposure through a tunnel, simulated Ring webhook, and REST
routes for the UI.

**[built]** `actions.ts`: one implementation of each household action (check in,
notify guardian, acknowledge, expect visitor), used by both the MCP tools and the Fire TV
buttons, so voice and remote can't drift apart.

**[built]** `context-engine.ts`: explainable rules first; Bedrock only for events no
rule covers. Every assessment records `decidedBy` (rule id, `bedrock`, or `default`),
which the TV displays. If Bedrock is unavailable, an event NEXUS can't assess is
shown at low urgency, never silently dropped.

**[built]** `apps/web`: Next.js kiosk that polls the server. It has a status screen with
a *Recent decisions* feed and a full-screen alert takeover with D-pad navigation
(focus on load, arrow keys, Back to close or dismiss) and a **Why?** panel.

**[planned]** DynamoDB-backed store implementing `store.ts`'s exported shape (schema below).

## 4. MCP tools (Alexa+ surface)

**[built]** in `apps/mcp-server/src/tools.ts`, with MCP annotations and `isError`
results for bad input:

| Tool | Kind | Purpose |
|---|---|---|
| `get_home_status` | read | Members, devices, pending reminders, active alerts |
| `get_recent_events` | read | Recent events with reasoning and `decidedBy` |
| `get_household_rules` | read | The rules the context engine applies |
| `get_expected_visitors` | read | Current visitor windows |
| `get_device_status` | read | Doorbell / display connectivity |
| `add_expected_visitor` | write | Suppress front-door alerts during a window |
| `show_on_fire_tv` | write | Push the status screen or an active alert to the TV |
| `create_reminder` | write | Create a household reminder |
| `start_check_in` | write | Start a check-in; resolves that member's missed-reminder alerts |
| `notify_guardian` | write | Notify the guardian (Amazon SNS when configured) |
| `acknowledge_event` | write | Mark an event handled and clear it from the TV |

## 5. AWS Builder mini challenge

- **Amazon Bedrock** — **[built]**, `bedrock-reasoner.ts`. Claude through Anthropic's
  Bedrock SDK (`AnthropicBedrockMantle`, default model `anthropic.claude-opus-5`, low
  effort for latency) with a structured-output schema, so every reply is a schema-valid
  assessment (importance, one-sentence reasoning, whether to alert, which actions). The
  prompt carries household context: local time, members, rules, expected visitors and
  recent events. Demo: `node scripts/demo.mjs ai`.
- **Amazon SNS** — **[built]**, `notifier.ts`. Guardian notifications go to an SNS topic
  (`NEXUS_GUARDIAN_SNS_TOPIC_ARN`) that the guardian subscribes to by SMS or email.
  Falls back to a console log if unset or failing.
- **DynamoDB** — **[planned]**, schema below.

### DynamoDB schema (single-table design, [planned])

| PK | SK | Attributes |
|---|---|---|
| `HOUSEHOLD#<id>` | `META` | name, timezone |
| `HOUSEHOLD#<id>` | `MEMBER#<id>` | name, role, needsCheckIn |
| `HOUSEHOLD#<id>` | `DEVICE#<id>` | name, kind, online, lastSeen |
| `HOUSEHOLD#<id>` | `RULE#<id>` | description, condition, action |
| `HOUSEHOLD#<id>` | `VISITOR#<windowStart>#<id>` | label, windowEnd |
| `HOUSEHOLD#<id>` | `EVENT#<ISO-timestamp>#<id>` | source, type, data, importance, reasoning, decidedBy |
| `HOUSEHOLD#<id>` | `ALERT#<id>` | eventId, title, message, severity, resolved |
| `HOUSEHOLD#<id>` | `REMINDER#<id>` | memberId, label, dueAt, acknowledged |

GSI1 (`GSI1PK = HOUSEHOLD#<id>#ALERTS`, `GSI1SK = resolved#createdAt`) serves "active
alerts" without a scan.

## 6. Fire TV UI

**[built]**, `apps/web`:

- **Status screen**: overall state, per-area rows, and *Recent decisions*, where each
  event shows its reasoning, what decided it, and whether it was surfaced or handled quietly.
- **Alert takeover**: title, one-sentence reason, *decided by …*, and action buttons that
  run real actions (**Check In**, **Notify Guardian**, **Dismiss**, **Why?**).
- **Remote-first interaction**: focus starts on the first action, the D-pad moves focus,
  Back closes details or dismisses, and the focused button is full signal color and scaled up.

Design system: two colors (`ink` surface, `signal` amber accent). Status and severity are
expressed through the signal color's intensity, never a new hue.

## 7. Schedule

| Days | Phase | Status |
|---|---|---|
| 1–3 | Architecture & setup | done |
| 4–9 | MCP server, 11 tools, Streamable HTTP | done |
| 10–14 | Context engine, decision provenance, tests | done |
| 15–18 | Fire TV UI, D-pad navigation | done |
| 19–23 | Bedrock (structured outputs) and SNS; verify with real AWS credentials | code done; live verification pending |
| 24–28 | Alexa+ Preview: register the MCP server through a tunnel, fix protocol edge cases | pending |
| 29–31 | Record on a real Fire TV (Silk) and Alexa+ device | pending |
| 32–34 | Open Source mini: external contribution (PR to a public MCP-related repo) | pending |
| 35–37 | Demo video ≤ 3 min | pending |
| 38–40 | Product feedback, friction log, Devpost write-up, submit | pending (see `docs/SUBMISSION.md`) |

## 8. Demo script (≤ 3 minutes)

| Time | Beat |
|---|---|
| 0:00–0:12 | Hook: TV takes over, "Someone is at the front door". "Most smart homes tell you what happened. NEXUS decides what matters." |
| 0:12–0:40 | *"Alexa, I'm expecting a package this afternoon."* (MCP `add_expected_visitor`) → doorbell → TV stays calm, and *Recent decisions* shows why |
| 0:40–1:15 | Care: missed medication → *Check-in suggested* → press **Check In** with the remote → TV clears |
| 1:15–1:40 | Voice follow-up: *"Alexa, what happened while I was out?"* (`get_recent_events`) → spoken summary with reasons |
| 1:40–2:10 | Glass-break sensor, no rule → **Amazon Bedrock** decides → TV shows *decided by Amazon Bedrock*, **Notify Guardian** → SMS arrives through SNS |
| 2:10–2:40 | Architecture in one screen: Alexa+ ↔ MCP ↔ context engine ↔ Bedrock / SNS ↔ Fire TV |
| 2:40–3:00 | Close: "NEXUS — the proactive AI layer for the home." |

`scripts/demo.mjs` reproduces every beat except the voice lines.

## 9. Submission checklist

- [ ] Repo public (MIT license visible in the About section), or private with the six Amazon reviewers and testing@devpost.com added near submission
- [x] Repo calls the required tech in code: MCP server over Streamable HTTP, `apps/mcp-server`
- [ ] Demo video ≤ 3 min, public, English, showing Alexa+ calling the MCP server
- [ ] Text description (draft in `docs/SUBMISSION.md`)
- [ ] Product feedback for every tool used, including AWS services (template in `docs/SUBMISSION.md`)
- [ ] Track and mini challenges stated: Alexa+; AWS Builder; Open Source
- [ ] Open Source mini: contribution URL, repo URL, GitHub username, description
- [x] AWS Builder mini: documented integrations (§5, README)
- [ ] Friction log entries (up to 10% judging bonus)
- [ ] Statement of what was built during the submission window
