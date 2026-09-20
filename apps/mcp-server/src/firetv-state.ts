// Tiny piece of shared state: which view the living room Fire TV should be
// showing right now. The web app's /api/firetv-view route reads this; the
// show_on_fire_tv MCP tool and the Ring webhook both write to it.

export interface FireTvView {
  view: "status" | "alert";
  alertId?: string;
}

let current: FireTvView = { view: "status" };

export function setFireTvView(next: FireTvView) {
  current = next;
}

export function getFireTvView(): FireTvView {
  return current;
}
