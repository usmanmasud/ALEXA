const BASE = process.env.NEXUS_API_URL ?? "http://localhost:4000";

export type AlertAction = "view" | "dismiss" | "check_in" | "notify_guardian";

export interface NexusEvent {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  importance?: "info" | "notice" | "warning" | "critical";
  reasoning?: string;
  decidedBy?: string;
  acknowledged?: boolean;
}

export interface FireTvViewResponse {
  view: "status" | "alert";
  alertId?: string;
  alert?: {
    id: string;
    eventId: string;
    title: string;
    message: string;
    severity: "info" | "notice" | "warning" | "critical";
    actions: AlertAction[];
    createdAt: string;
  };
  event?: NexusEvent;
}

export async function fetchHomeStatus() {
  const res = await fetch(`${BASE}/api/home-status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`home-status failed: ${res.status}`);
  return res.json();
}

export async function fetchFireTvView(): Promise<FireTvViewResponse> {
  const res = await fetch(`${BASE}/api/firetv-view`, { cache: "no-store" });
  if (!res.ok) throw new Error(`firetv-view failed: ${res.status}`);
  return res.json();
}

export async function fetchEvents(): Promise<NexusEvent[]> {
  const res = await fetch(`${BASE}/api/events`, { cache: "no-store" });
  if (!res.ok) throw new Error(`events failed: ${res.status}`);
  return res.json();
}

export async function actOnAlert(alertId: string, action: AlertAction) {
  const res = await fetch(`${BASE}/api/alerts/${alertId}/actions/${action}`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `action failed: ${res.status}`);
  return res.json();
}

/** Plain-language label for what made a decision, shown on the TV so NEXUS is never a black box. */
export function describeDecider(decidedBy?: string) {
  if (!decidedBy) return "NEXUS";
  if (decidedBy === "bedrock") return "Amazon Bedrock";
  if (decidedBy === "default" || decidedBy === "system") return "NEXUS";
  return "Household rule";
}
