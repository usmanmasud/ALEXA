# Devpost submission kit

Drafts for each Devpost field. Anything in **[brackets]** needs your own input. Friction log
entries must describe what actually happened to you; judges compare them against the
video and the repo.

---

## Tracks

- **Primary track:** Alexa+ (self-hosted MCP server, Streamable HTTP, protocol 2025-11-25)
- **Mini challenges:** AWS Builder; Open Source

## Built during the submission window

The repository was created on Sep 20, 2026, after the hackathon opened. All code (the MCP
server, context engine, Bedrock and SNS integrations, Fire TV UI, tests and demo tooling) was
written during the submission window. See the commit history.

---

## Project description (Devpost "About the project")

### Inspiration
Smart homes are good at telling you *that* something happened and bad at telling you whether
it matters. Every doorbell, motion ping and reminder arrives with the same urgency, so people
mute them, and then the one that mattered (Mom didn't take her evening medication, the door
opened at 2am) gets lost with the rest.

### What it does
NEXUS is a household context engine that plugs into **Alexa+ as a self-hosted MCP server**.
Each Ring event, missed reminder or sensor event passes through NEXUS before it reaches a
person. NEXUS weighs it against household rules, the time of day, expected-visitor windows
and recent activity, then decides whether to interrupt anyone and says why in one sentence.

- An unexpected doorbell takes over the living-room **Fire TV** with the reason and actions.
- *"Alexa, I'm expecting a package this afternoon"* means the next doorbell is handled
  quietly, and the TV's *Recent decisions* feed shows why.
- A missed medication with no activity for 90 minutes becomes a **Check In** / **Notify
  Guardian** prompt. Notify Guardian sends an SMS through **Amazon SNS**.
- Events no rule covers, like a glass-break sensor, are assessed by **Claude on Amazon
  Bedrock** using the household's context, and the TV labels them *decided by Amazon Bedrock*.

Every decision records what made it, and nothing NEXUS can't assess is silently dropped.

### How we built it
- **MCP server** (TypeScript, `@modelcontextprotocol/sdk`, Express): Streamable HTTP at
  `/mcp`, 11 tools with read/write annotations and recoverable tool errors, bearer-token
  auth for exposure through a tunnel.
- **Context engine**: explainable rules first, Bedrock second, fail-safe third. Each
  assessment carries `decidedBy`.
- **Amazon Bedrock**: Claude through Anthropic's Bedrock SDK with structured outputs, so the
  model always returns a schema-valid assessment.
- **Amazon SNS**: guardian notifications.
- **Fire TV UI** (Next.js in Silk): a remote-first alert takeover with D-pad focus, Back to
  dismiss, and a **Why?** panel. Voice and remote call the same action code, so they can't drift.
- Tests for the decision logic and actions (`npm test`), and a demo driver that talks to the
  server over MCP the way Alexa+ does.

### Challenges we ran into
**[Your real challenges — e.g. getting Alexa+ Preview to reach a local server, Bedrock model access.]**

### Accomplishments we're proud of
- Quiet is a decision with a reason: the product's value shows up when it *doesn't* interrupt.
- One action layer for voice and remote.
- Explainability on the TV: every alert says what decided it.

### What we learned
**[Your words.]**

### What's next
DynamoDB-backed household state (schema in `docs/BLUEPRINT.md`), real Ring event
subscriptions, per-household rule editing by voice (*"Alexa, don't bother me about the back
garden camera after 10pm"*), and a native Vega OS Fire TV app.

---

## Product feedback (required, one block per tool)

Fill in **[bracketed]** parts from your own experience.

### Alexa+ (MCP integration)
- **Used for:** exposing NEXUS's 11 tools to Alexa+ as a self-hosted MCP server.
- **Worked well:** **[…]**
- **Needs work:** **[…]**
- **Onboarding:** **[…]**
- **Would build again:** **[yes/no + why]**

### Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.30)
- **Used for:** the Streamable HTTP server transport, tool registration with Zod schemas and annotations, and the client in `scripts/demo.mjs`.
- **Worked well:** `registerTool` with Zod input schemas and annotations is concise; session handling with `StreamableHTTPServerTransport` is a few lines; the same SDK gives a client for end-to-end testing.
- **Needs work:** the package exports two different `LATEST_PROTOCOL_VERSION` constants (`types.js` says `2025-11-25`, `spec.types.js` says `DRAFT-2026-v1`), which makes it hard to confirm which spec version a server actually negotiates without sending an `initialize` request.
- **Would build again:** yes.

### Amazon Bedrock
- **Used for:** assessing household events no rule covers, using Claude with structured outputs.
- **Worked well:** **[…]**
- **Needs work:** with no credentials configured, the error is a generic "Failed to resolve AWS credentials from the credential provider chain" with no hint about which sources were tried or how to fix it. **[Add model-access / console experience.]**
- **Onboarding:** **[…]**
- **Would build again:** **[…]**

### Amazon SNS
- **Used for:** guardian notifications (SMS/email) from `notify_guardian`.
- **Worked well / needs work / onboarding:** **[e.g. SMS sandbox, verifying a phone number]**

### Fire TV (Silk browser as kiosk surface)
- **Used for:** the living-room display.
- **Feedback:** **[D-pad key events in Silk, testing on device vs. simulator]**

---

## Friction log (up to 10% bonus)

Format per entry: task · steps · expected vs. actual · severity · workaround · suggestion.

1. **Confirming the negotiated MCP protocol version**
   - *Task:* confirm the server speaks spec 2025-11-25 as the Alexa+ track requires.
   - *Steps:* checked the installed SDK's exported `LATEST_PROTOCOL_VERSION`.
   - *Expected:* one constant. *Actual:* `types.js` exports `2025-11-25` while `spec.types.js` exports `DRAFT-2026-v1`.
   - *Severity:* low. *Workaround:* sent a raw `initialize` with `protocolVersion: "2025-11-25"` and read the response.
   - *Suggestion:* the Alexa+ docs could include a one-line curl for checking the negotiated version, and the SDK could export a single public constant.

2. **Bedrock credentials in local development**
   - *Task:* call Bedrock from a local Node server.
   - *Expected:* an actionable error when credentials are missing. *Actual:* "Failed to resolve AWS credentials from the credential provider chain."
   - *Severity:* medium. *Workaround:* the integration fails safe to a default assessment.
   - *Suggestion:* list the sources that were tried and link to the Bedrock quickstart.

3. **[Alexa+ Preview: registering a self-hosted MCP server]** **[your steps, what happened, severity, workaround, suggestion]**

4. **[Bedrock model access request]** **[…]**

5. **[SNS SMS sandbox / phone verification]** **[…]**

---

## Feature requests (optional)

- **Alexa+ proactive notifications from MCP servers** (important): let an MCP server ask
  Alexa+ to speak an alert, not just answer when asked. NEXUS decides *when* to interrupt,
  and today the Fire TV is the only surface it can push to.
- **A Ring event webhook sandbox** (important): a hosted simulator that sends realistic
  doorbell and motion events to a developer URL, so projects can use real Ring payloads without hardware.

---

## Open Source mini challenge

- **Repo URL:** https://github.com/usmanmasud/ALEXA (MIT)
- **GitHub username:** usmanmasud
- **Contribution URL:** **[PR or fork URL in another public repo]**
- **Description:** **[what you changed, how it works, why it matters]**
