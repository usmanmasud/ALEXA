import type { HomeStatus } from "@nexus/shared";
import { alerts, devices, members, reminders } from "./store.js";

export function computeHomeStatus(): HomeStatus {
  const activeAlerts = alerts.filter((a) => !a.resolved);
  const pendingReminders = reminders.filter((r) => !r.acknowledged).length;
  const overall: HomeStatus["overall"] = activeAlerts.some((a) => a.severity === "critical")
    ? "alert"
    : activeAlerts.length > 0 || pendingReminders > 0
      ? "attention"
      : "normal";

  return {
    overall,
    members,
    devices,
    pendingReminders,
    activeAlerts,
    lastUpdated: new Date().toISOString(),
  };
}
