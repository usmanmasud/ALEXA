"use client";

import { useEffect, useState } from "react";
import { acknowledgeAlert, fetchFireTvView, fetchHomeStatus, type FireTvViewResponse } from "@/lib/api";
import { StatusScreen } from "@/components/StatusScreen";
import { AlertScreen } from "@/components/AlertScreen";

// This is the living-room Fire TV surface: a kiosk view that polls NEXUS
// and switches itself between the calm status screen and a full-screen
// alert takeover, the way the actual demo needs it to behave.

export default function FireTvHome() {
  const [status, setStatus] = useState<any>(null);
  const [fireTvView, setFireTvView] = useState<FireTvViewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [statusRes, viewRes] = await Promise.all([fetchHomeStatus(), fetchFireTvView()]);
        if (!cancelled) {
          setStatus(statusRes);
          setFireTvView(viewRes);
        }
      } catch {
        // NEXUS server not reachable yet; keep showing the connecting state.
      }
    }

    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (fireTvView?.view === "alert" && fireTvView.alert) {
    return (
      <AlertScreen
        alert={fireTvView.alert}
        onAction={async (action) => {
          if (action === "dismiss" || action === "view" || action === "check_in" || action === "notify_guardian") {
            await acknowledgeAlert(fireTvView.alert!.id);
          }
        }}
      />
    );
  }

  return <StatusScreen status={status} />;
}
