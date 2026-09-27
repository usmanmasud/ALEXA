# Contributing to NEXUS

Thanks for helping. NEXUS is small on purpose, so most changes touch one of three places.

## Setup

```bash
npm install
npm test            # builds shared types, runs the context-engine tests
npm run dev:mcp     # server on :4000
npm run dev:web     # Fire TV UI on :3000
```

## Where things go

- **A new household rule:** add it to `rules` in `apps/mcp-server/src/store.ts`, handle it in
  `assessEventByRules` in `context-engine.ts` with a `decidedBy` matching the rule id, and
  add a test in `apps/mcp-server/test/`.
- **A new MCP tool:** register it in `tools.ts`. If it changes household state, put the logic
  in `actions.ts` so the Fire TV can call it too. Mark it with the right annotations
  (`readOnlyHint`, `idempotentHint`, `openWorldHint`).
- **A new event source:** post events to `POST /webhooks/ring` (or add a sibling route) in the
  `{ type, data }` shape; the context engine does the rest.

## Ground rules

- Every decision must be explainable: set `decidedBy` and a one-sentence `reasoning`.
- Fail toward the human: if NEXUS can't assess something, it surfaces it, never drops it.
- The UI must work with a Fire TV remote (arrow keys, Enter, Back), not just a mouse.
- `npm test` and `npm run build` must pass.

By contributing you agree your work is released under the MIT license.
