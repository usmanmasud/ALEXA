const BASE = process.env.NEXUS_API_URL ?? "http://localhost:4000";

export interface FireTvViewResponse {
  view: "status" | "alert";
  alertId?: string;
  alert?: {
    id: string;
    title: string;
    message: string;
    severity: "info" | "notice" | "warning" | "critical";
    actions: string[];
    createdAt: string;
  };
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

export async function acknowledgeAlert(alertId: string) {
  await fetch(`${BASE}/api/acknowledge/${alertId}`, { method: "POST" });
}
