"use client";

import { useCallback, useEffect, useState } from "react";
import {
  actOnAlert,
  fetchEvents,
  fetchFireTvView,
  fetchHomeStatus,
  type FireTvViewResponse,
  type NexusEvent,
} from "@/lib/api";
import { StatusScreen } from "@/components/StatusScreen";
import { AlertScreen } from "@/components/AlertScreen";

// This is the living-room Fire TV surface: a kiosk view that polls NEXUS
// and switches itself between the calm status screen and a full-screen
// alert takeover. Alert buttons run the same household actions as the
// Alexa+ MCP tools, so voice and remote stay in sync.

export default function FireTvHome() {
  const [status, setStatus] = useState<any>(null);
  const [events, setEvents] = useState<NexusEvent[]>([]);
  const [fireTvView, setFireTvView] = useState<FireTvViewResponse | null>(null);

  const poll = useCallback(async () => {
    try {
      const [statusRes, viewRes, eventsRes] = await Promise.all([fetchHomeStatus(), fetchFireTvView(), fetchEvents()]);
      setStatus(statusRes);
      setFireTvView(viewRes);
      setEvents(eventsRes);
    } catch {
      // NEXUS server not reachable yet; keep showing the connecting state.
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  if (fireTvView?.view === "alert" && fireTvView.alert) {
    const alert = fireTvView.alert;
    return (
      <AlertScreen
        key={alert.id}
        alert={alert}
        event={fireTvView.event}
        onAction={async (action) => {
          await actOnAlert(alert.id, action);
          await poll();
        }}
      />
    );
  }

  return <StatusScreen status={status} events={events} />;
}
