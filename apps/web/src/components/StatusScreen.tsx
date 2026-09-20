interface HomeStatus {
  overall: "normal" | "attention" | "alert";
  members: { id: string; name: string }[];
  devices: { id: string; name: string; online: boolean }[];
  pendingReminders: number;
  lastUpdated: string;
}

export function StatusScreen({ status }: { status: HomeStatus | null }) {
  if (!status) {
    return (
      <main style={styles.main}>
        <p style={{ color: "var(--paper-dim)" }}>Connecting to NEXUS…</p>
      </main>
    );
  }

  const rows = [
    { label: "Front Door", ok: status.devices.every((d) => d.online) },
    { label: "Family", ok: status.overall !== "alert" },
    { label: "Reminders", ok: status.pendingReminders === 0, note: status.pendingReminders > 0 ? `${status.pendingReminders} pending` : undefined },
  ];

  return (
    <main style={styles.main}>
      <div style={styles.headerRow}>
        <span style={styles.eyebrow}>NEXUS</span>
        <span style={styles.dot("var(--signal)", status.overall !== "normal")} />
      </div>
      <h1 style={styles.h1}>Home Status</h1>
      <p style={{ color: "var(--paper-dim)", marginTop: -8, marginBottom: 48 }}>
        {status.overall === "normal" ? "All systems normal" : "Needs your attention"}
      </p>

      <div style={styles.rows}>
        {rows.map((r) => (
          <div key={r.label} style={styles.row}>
            <span style={styles.dot(r.ok ? "var(--signal)" : "var(--paper-dim)", false)} />
            <span style={{ flex: 1 }}>{r.label}</span>
            <span style={{ color: r.note ? "var(--signal)" : "var(--paper-dim)" }}>
              {r.note ?? (r.ok ? "Secure" : "Check")}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    padding: "8vh 8vw",
  },
  headerRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  eyebrow: {
    letterSpacing: "0.3em",
    fontSize: 14,
    color: "var(--paper-dim)",
    fontWeight: 600,
  },
  h1: { fontSize: "clamp(32px, 5vw, 56px)", margin: 0, fontWeight: 700 },
  rows: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
    maxWidth: 640,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "18px 22px",
    borderRadius: "var(--radius)",
    background: "var(--ink-900)",
    border: "1px solid var(--ink-700)",
    fontSize: 20,
  },
  dot: (color: string, pulse: boolean) => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: color,
    boxShadow: pulse ? `0 0 0 6px var(--signal-glow)` : "none",
    flexShrink: 0,
  }),
};
