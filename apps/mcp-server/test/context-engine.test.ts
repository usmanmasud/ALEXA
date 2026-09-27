import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addEvent, alerts, expectedVisitors, resetHousehold } from "../src/store.js";
import { assessEvent, processEvent } from "../src/context-engine.js";
import { actOnAlert, expectVisitor, startCheckIn } from "../src/actions.js";
import { getFireTvView, setFireTvView } from "../src/firetv-state.js";

// Local-time timestamps, since night hours are judged in the household's time zone.
function at(hour: number) {
  const d = new Date();
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

function ringEvent(type: string, timestamp: string, data: Record<string, unknown> = {}) {
  return addEvent({ source: "ring", type, timestamp, data });
}

beforeEach(() => {
  resetHousehold();
  setFireTvView({ view: "status" });
});

test("daytime doorbell with no visitor on record is surfaced without urgency", async () => {
  const a = await assessEvent(ringEvent("doorbell", at(14)));
  assert.equal(a.shouldAlert, true);
  assert.equal(a.importance, "notice");
  assert.equal(a.decidedBy, "rule-unexpected-visitor");
});

test("front-door activity at night is critical", async () => {
  const a = await assessEvent(ringEvent("motion", at(2)));
  assert.equal(a.importance, "critical");
  assert.deepEqual(a.suggestedActions, ["view", "notify_guardian"]);
});

test("an expected visitor suppresses the front-door alert", async () => {
  const now = new Date();
  expectVisitor({ label: "package delivery", windowStart: new Date(now.getTime() - 60_000).toISOString(), durationMinutes: 60 });
  const a = await assessEvent(ringEvent("doorbell", now.toISOString()));
  assert.equal(a.shouldAlert, false);
  assert.match(a.reasoning, /package delivery/);
  assert.equal(a.decidedBy, "rule-expected-visitor");
});

test("expectVisitor rejects a window that ends before it starts", () => {
  assert.throws(() => expectVisitor({ label: "x", windowStart: at(15), windowEnd: at(14) }));
  assert.equal(expectedVisitors.length, 0);
});

test("missed medication past 90 minutes offers a check-in; check-in resolves it and clears the TV", async () => {
  const event = await processEvent(
    ringEvent("reminder.missed", new Date().toISOString(), { memberId: "mem-mom", reminderId: "rem-1" }),
  );
  assert.equal(event.importance, "warning");
  const alert = alerts.find((a) => a.eventId === event.id)!;
  assert.deepEqual(alert.actions, ["check_in", "notify_guardian"]);

  setFireTvView({ view: "alert", alertId: alert.id });
  await actOnAlert(alert.id, "check_in");

  assert.equal(alert.resolved, true);
  assert.equal(getFireTvView().view, "status");
});

test("check-in events are handled by a rule, not escalated", async () => {
  const { event } = await startCheckIn("mem-mom");
  assert.equal(event.decidedBy, "rule-missed-medication");
  assert.equal(event.importance, "info");
});

test("notify_guardian from the TV notifies, resolves the alert, and logs the delivery", async () => {
  const event = await processEvent(ringEvent("motion", at(2)));
  const alert = alerts.find((a) => a.eventId === event.id)!;
  const result = (await actOnAlert(alert.id, "notify_guardian")) as { delivery: { channel: string } };
  assert.equal(result.delivery.channel, "console");
  assert.equal(alert.resolved, true);
});

test("an event no rule covers is surfaced, not dropped, when Bedrock is unavailable", async () => {
  // No AWS credentials in the test environment, so the Bedrock call fails safe.
  const event = await processEvent(ringEvent("glass_break", new Date().toISOString(), { room: "kitchen" }));
  if (event.decidedBy === "bedrock") return; // credentials present: the model made the call instead
  assert.equal(event.decidedBy, "default");
  const alert = alerts.find((a) => a.eventId === event.id)!;
  assert.equal(alert.title, "Glass break");
  assert.deepEqual(alert.actions, ["view", "dismiss"]);
});
