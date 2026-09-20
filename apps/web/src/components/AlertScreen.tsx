import type { FireTvViewResponse } from "@/lib/api";

export function AlertScreen({
  alert,
  onAction,
}: {
  alert: NonNullable<FireTvViewResponse["alert"]>;
  onAction: (action: string) => void;
}) {
  return (
    <main style={styles.main}>
      <div style={styles.badge}>NEXUS ALERT</div>
      <h1 style={styles.h1}>{alert.title}</h1>
      <p style={styles.message}>{alert.message}</p>
      <p style={styles.timestamp}>{new Date(alert.createdAt).toLocaleTimeString()}</p>

      <div style={styles.actions}>
        {alert.actions.map((action) => (
          <button key={action} style={styles.button} onClick={() => onAction(action)}>
            {label(action)}
          </button>
        ))}
      </div>
    </main>
  );
}

function label(action: string) {
  switch (action) {
    case "view":
      return "View";
    case "dismiss":
      return "Dismiss";
    case "check_in":
      return "Check In";
    case "notify_guardian":
      return "Notify Guardian";
    default:
      return action;
  }
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    padding: "8vh 8vw",
    background:
      "radial-gradient(circle at 15% 15%, var(--signal-glow), transparent 55%), var(--ink-950)",
  },
  badge: {
    display: "inline-block",
    alignSelf: "flex-start",
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid var(--signal)",
    color: "var(--signal)",
    fontSize: 14,
    letterSpacing: "0.2em",
    fontWeight: 700,
    marginBottom: 32,
  },
  h1: { fontSize: "clamp(32px, 5vw, 52px)", margin: 0, maxWidth: 900, fontWeight: 700 },
  message: { fontSize: 22, color: "var(--paper-dim)", maxWidth: 760, marginTop: 20 },
  timestamp: { color: "var(--paper-dim)", fontSize: 14, marginTop: 8 },
  actions: { display: "flex", gap: 16, marginTop: 56 },
  button: {
    padding: "16px 32px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--signal)",
    background: "var(--signal)",
    color: "var(--ink-950)",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
  },
};
