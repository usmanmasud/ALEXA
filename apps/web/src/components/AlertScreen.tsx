"use client";

import { useEffect, useRef, useState } from "react";
import { describeDecider, type AlertAction, type FireTvViewResponse, type NexusEvent } from "@/lib/api";

// Full-screen alert takeover, built for a Fire TV remote: focus starts on the
// first action, Left/Right (or Up/Down) move between actions, Select presses,
// and Back closes the details panel or dismisses the alert.

const BACK_KEYS = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);

export function AlertScreen({
  alert,
  event,
  onAction,
}: {
  alert: NonNullable<FireTvViewResponse["alert"]>;
  event?: NexusEvent;
  onAction: (action: AlertAction) => Promise<void>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState<AlertAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  async function press(action: AlertAction) {
    if (action === "view") {
      setShowDetails((open) => !open);
      return;
    }
    setBusy(action);
    setError(null);
    try {
      await onAction(action);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    buttons.current[0]?.focus();
  }, [alert.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const count = alert.actions.length;
      const current = buttons.current.findIndex((b) => b === document.activeElement);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        buttons.current[(current + 1 + count) % count]?.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        buttons.current[(Math.max(current, 0) - 1 + count) % count]?.focus();
      } else if (BACK_KEYS.has(e.key)) {
        e.preventDefault();
        if (showDetails) setShowDetails(false);
        else if (alert.actions.includes("dismiss")) void press("dismiss");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main style={styles.main}>
      <div style={styles.badge(alert.severity === "critical")}>NEXUS ALERT</div>
      <h1 style={styles.h1}>{alert.title}</h1>
      <p style={styles.message}>{alert.message}</p>
      <p style={styles.timestamp}>
        {new Date(alert.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · decided by{" "}
        {describeDecider(event?.decidedBy)}
      </p>

      {showDetails && event && (
        <dl style={styles.details}>
          <dt style={styles.dt}>Source</dt>
          <dd style={styles.dd}>
            {event.source} · {event.type}
          </dd>
          <dt style={styles.dt}>Why</dt>
          <dd style={styles.dd}>{event.reasoning}</dd>
          <dt style={styles.dt}>Decided by</dt>
          <dd style={styles.dd}>
            {describeDecider(event.decidedBy)}
            {event.decidedBy && event.decidedBy !== "bedrock" ? ` (${event.decidedBy})` : ""}
          </dd>
        </dl>
      )}

      <div style={styles.actions}>
        {alert.actions.map((action, i) => (
          <button
            key={action}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            className="tv-button"
            disabled={busy !== null}
            onClick={() => void press(action)}
          >
            {busy === action ? "…" : label(action, showDetails)}
          </button>
        ))}
      </div>
      {error && <p style={styles.error}>{error}</p>}
    </main>
  );
}

function label(action: AlertAction, detailsOpen: boolean) {
  switch (action) {
    case "view":
      return detailsOpen ? "Hide Details" : "Why?";
    case "dismiss":
      return "Dismiss";
    case "check_in":
      return "Check In";
    case "notify_guardian":
      return "Notify Guardian";
  }
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    padding: "8vh 8vw",
    background: "radial-gradient(circle at 15% 15%, var(--signal-glow), transparent 55%), var(--ink-950)",
  },
  badge: (critical: boolean) => ({
    display: "inline-block",
    alignSelf: "flex-start",
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid var(--signal)",
    background: critical ? "var(--signal)" : "transparent",
    color: critical ? "var(--ink-950)" : "var(--signal)",
    fontSize: 14,
    letterSpacing: "0.2em",
    fontWeight: 700,
    marginBottom: 32,
  }),
  h1: { fontSize: "clamp(32px, 5vw, 52px)", margin: 0, maxWidth: 900, fontWeight: 700 },
  message: { fontSize: 22, color: "var(--paper-dim)", maxWidth: 760, marginTop: 20 },
  timestamp: { color: "var(--paper-dim)", fontSize: 14, marginTop: 8 },
  details: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "10px 24px",
    maxWidth: 760,
    marginTop: 28,
    padding: "20px 24px",
    borderRadius: "var(--radius)",
    background: "var(--ink-900)",
    border: "1px solid var(--ink-700)",
    fontSize: 18,
  },
  dt: { color: "var(--paper-dim)", margin: 0 },
  dd: { margin: 0 },
  actions: { display: "flex", gap: 16, marginTop: 48, flexWrap: "wrap" as const },
  error: { color: "var(--signal)", marginTop: 16 },
};
