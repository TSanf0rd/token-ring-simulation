import { useState, useEffect, useCallback, useRef } from "react";

const COLORS = {
  bg: "#0a0e1a",
  panel: "#111827",
  panelBorder: "#1e293b",
  ring: "#334155",
  tokenGold: "#f59e0b",
  tokenGlow: "rgba(245, 158, 11, 0.3)",
  mssDefault: "#3b82f6",
  mssActive: "#10b981",
  mssToken: "#f59e0b",
  mhDefault: "#8b5cf6",
  mhRequesting: "#ef4444",
  mhGranted: "#10b981",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  deliverable: "#10b981",
  undeliverable: "#ef4444",
  accent: "#6366f1",
  logBg: "#0f172a",
  queueBg: "#1a1a2e",
  priority: "#fbbf24",
};

const FONTS = {
  display: "'JetBrains Mono', 'Fira Code', monospace",
  body: "'Inter', system-ui, sans-serif",
};

const NUM_MSS = 5;
const RING_RADIUS = 130;
const CENTER = { x: 180, y: 180 };

function generateMHs() {
  return [
    { id: "MH1", mssId: 0, hCount: 0, requesting: false, granted: false },
    { id: "MH2", mssId: 0, hCount: 0, requesting: false, granted: false },
    { id: "MH3", mssId: 1, hCount: 0, requesting: false, granted: false },
    { id: "MH4", mssId: 2, hCount: 0, requesting: false, granted: false },
    { id: "MH5", mssId: 2, hCount: 0, requesting: false, granted: false },
    { id: "MH6", mssId: 3, hCount: 0, requesting: false, granted: false },
    { id: "MH7", mssId: 4, hCount: 0, requesting: false, granted: false },
    { id: "MH8", mssId: 4, hCount: 0, requesting: false, granted: false },
  ];
}

function getMSSPos(i) {
  const angle = (2 * Math.PI * i) / NUM_MSS - Math.PI / 2;
  return {
    x: CENTER.x + RING_RADIUS * Math.cos(angle),
    y: CENTER.y + RING_RADIUS * Math.sin(angle),
  };
}

function initQueues() {
  const q = {};
  for (let i = 0; i < NUM_MSS; i++) q[i] = [];
  return q;
}

export default function TokenRingReplication() {
  const [mhs, setMHs] = useState(generateMHs());
  const [tokenAt, setTokenAt] = useState(0);
  const [logs, setLogs] = useState([]);
  const [queues, setQueues] = useState(initQueues);
  const [phase, setPhase] = useState("idle");
  const [step, setStep] = useState(0);
  const [selectedMH, setSelectedMH] = useState(null);
  const [globalPriorityCounter, setGlobalPriorityCounter] = useState(1);
  const [highlightMSS, setHighlightMSS] = useState(null);
  const [animatingToken, setAnimatingToken] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [tab, setTab] = useState("ring");
  const logEndRef = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    setLogs((prev) => [...prev, { msg, type, ts: Date.now() }]);
  }, []);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRequest = useCallback(
    (mhId) => {
      if (phase !== "idle") return;
      const mh = mhs.find((m) => m.id === mhId);
      if (!mh || mh.requesting || mh.granted) return;

      setPhase("requesting");
      const newHCount = mh.hCount + 1;

      setMHs((prev) =>
        prev.map((m) => (m.id === mhId ? { ...m, hCount: newHCount, requesting: true } : m))
      );

      addLog(`${mhId} increments h_count to ${newHCount} and sends req(${mhId}, ${newHCount}) to local MSS${mh.mssId}`, "request");

      setTimeout(() => {
        addLog(`MSS${mh.mssId} (local) broadcasts req(${mhId}, ${newHCount}) to ALL other MSSs — Phase 1`, "broadcast");

        const tempPriorities = {};
        const newQueues = { ...queues };

        for (let i = 0; i < NUM_MSS; i++) {
          const existingMax = newQueues[i].length > 0 ? Math.max(...newQueues[i].map((r) => r.priority)) : 0;
          const tempPri = existingMax + 1;
          tempPriorities[i] = tempPri;

          newQueues[i] = [
            ...newQueues[i],
            {
              mhId,
              hCount: newHCount,
              priority: tempPri,
              deliverable: false,
              tempPriority: true,
            },
          ];

          addLog(
            `MSS${i} assigns TEMP priority ${tempPri} to ${mhId} (undeliverable), sends priority to MSS${mh.mssId}`,
            "priority"
          );
        }

        setQueues(newQueues);

        setTimeout(() => {
          const finalPriority = Math.max(...Object.values(tempPriorities));
          addLog(
            `MSS${mh.mssId} collects all temp priorities → max = ${finalPriority}. Broadcasts FINAL priority to all MSSs — Phase 2`,
            "broadcast"
          );

          const finalQueues = {};
          for (let i = 0; i < NUM_MSS; i++) {
            finalQueues[i] = newQueues[i].map((r) =>
              r.mhId === mhId && r.hCount === newHCount
                ? { ...r, priority: finalPriority, deliverable: true, tempPriority: false }
                : r
            );
            finalQueues[i].sort((a, b) => a.priority - b.priority);
          }

          setQueues(finalQueues);
          setGlobalPriorityCounter((prev) => Math.max(prev, finalPriority + 1));

          for (let i = 0; i < NUM_MSS; i++) {
            addLog(
              `MSS${i}: updates ${mhId} → priority=${finalPriority}, DELIVERABLE. Re-sorts queue.`,
              "deliver"
            );
          }

          setPhase("idle");
        }, 1200);
      }, 800);
    },
    [mhs, phase, queues, addLog]
  );

  const handleServeToken = useCallback(() => {
    if (phase !== "idle") return;

    const mssQueue = queues[tokenAt];
    const deliverableLocal = mssQueue.filter(
      (r) => r.deliverable && mhs.find((m) => m.id === r.mhId && m.mssId === tokenAt)
    );

    if (deliverableLocal.length === 0) {
      addLog(`MSS${tokenAt} has no deliverable local requests. Passing token to MSS${(tokenAt + 1) % NUM_MSS}...`, "token");
      setPhase("passing");
      setAnimatingToken(true);
      setTimeout(() => {
        setTokenAt((prev) => (prev + 1) % NUM_MSS);
        setAnimatingToken(false);
        setPhase("idle");
        addLog(`Token arrived at MSS${(tokenAt + 1) % NUM_MSS}`, "token");
      }, 1000);
      return;
    }

    const highestPriority = deliverableLocal.reduce((best, r) => (r.priority < best.priority ? r : best), deliverableLocal[0]);

    setPhase("granting");
    addLog(
      `MSS${tokenAt} grants token to ${highestPriority.mhId} (priority=${highestPriority.priority}, h_count=${highestPriority.hCount}). ${highestPriority.mhId} enters CRITICAL SECTION.`,
      "grant"
    );

    setMHs((prev) =>
      prev.map((m) => (m.id === highestPriority.mhId ? { ...m, requesting: false, granted: true } : m))
    );
    setHighlightMSS(tokenAt);

    setTimeout(() => {
      addLog(`${highestPriority.mhId} exits critical section. Sends release(${highestPriority.mhId}, ${highestPriority.hCount}) to MSS${tokenAt}`, "release");
      addLog(`MSS${tokenAt} broadcasts delete(${highestPriority.mhId}, ${highestPriority.hCount}) to ALL MSSs`, "broadcast");

      const newQueues = {};
      for (let i = 0; i < NUM_MSS; i++) {
        newQueues[i] = queues[i].filter(
          (r) => !(r.mhId === highestPriority.mhId && r.hCount === highestPriority.hCount)
        );
      }
      setQueues(newQueues);

      setMHs((prev) =>
        prev.map((m) => (m.id === highestPriority.mhId ? { ...m, granted: false } : m))
      );

      setHighlightMSS(null);

      addLog(`All MSSs remove ${highestPriority.mhId}'s request from their queues.`, "deliver");

      setPhase("idle");
    }, 2000);
  }, [phase, queues, tokenAt, mhs, addLog]);

  const handleReset = () => {
    setMHs(generateMHs());
    setTokenAt(0);
    setLogs([]);
    setQueues(initQueues());
    setPhase("idle");
    setStep(0);
    setSelectedMH(null);
    setGlobalPriorityCounter(1);
    setHighlightMSS(null);
    setAnimatingToken(false);
  };

  const mhsByMSS = {};
  for (let i = 0; i < NUM_MSS; i++) mhsByMSS[i] = mhs.filter((m) => m.mssId === i);

  return (
    <div style={{ fontFamily: FONTS.body, background: COLORS.bg, color: COLORS.textPrimary, minHeight: "100vh", padding: "16px", boxSizing: "border-box" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <header style={{ textAlign: "center", marginBottom: 16 }}>
        <h1 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, margin: 0, background: "linear-gradient(135deg, #6366f1, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Token-Ring Mutual Exclusion
        </h1>
        <p style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.textMuted, margin: "4px 0 0" }}>
          Data Replication Scheme — Interactive Simulation
        </p>
      </header>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, justifyContent: "center" }}>
        {[
          { key: "ring", label: "Ring View" },
          { key: "queues", label: "MSS Queues" },
          { key: "learn", label: "How It Works" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: FONTS.display,
              fontSize: 11,
              padding: "6px 14px",
              background: tab === t.key ? COLORS.accent : "transparent",
              color: tab === t.key ? "#fff" : COLORS.textSecondary,
              border: `1px solid ${tab === t.key ? COLORS.accent : COLORS.panelBorder}`,
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "learn" && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: 20, background: COLORS.panel, borderRadius: 12, border: `1px solid ${COLORS.panelBorder}` }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.tokenGold, marginTop: 0 }}>Data Replication Based Protocol</h2>

          <div style={{ fontSize: 13, lineHeight: 1.7, color: COLORS.textSecondary }}>
            <p><strong style={{ color: COLORS.textPrimary }}>The Problem:</strong> In a mobile computing environment, Mobile Hosts (MHs) move between cells served by Mobile Support Stations (MSSs). We need mutual exclusion — only one MH can access a shared resource at a time. But MHs move around, so how does the token find them?</p>

            <p><strong style={{ color: COLORS.textPrimary }}>The Key Idea — Replication:</strong> Instead of tracking where each MH is (expensive searching), we <em>replicate</em> each request at <em>every</em> MSS. This way, whichever MSS currently has the token AND the MH in its cell can serve the request directly — no searching needed.</p>

            <h3 style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.mssDefault, marginTop: 20 }}>How It Works (Step by Step):</h3>

            <p><strong style={{ color: "#f59e0b" }}>1. MH Sends Request:</strong> MH increments its local counter <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 3 }}>h_count</code> and sends <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 3 }}>req(h, h_count)</code> to its local MSS.</p>

            <p><strong style={{ color: "#f59e0b" }}>2. Phase 1 — Broadcast & Temp Priority:</strong> The local MSS broadcasts the request to ALL other MSSs. Each MSS assigns a <em>temporary priority</em> (higher than all existing requests in its queue) and tags it as <em style={{ color: COLORS.undeliverable }}>undeliverable</em>. Each MSS sends its temp priority back to the requesting MSS.</p>

            <p><strong style={{ color: "#f59e0b" }}>3. Phase 2 — Final Priority:</strong> The local MSS takes the MAX of all temp priorities and broadcasts it. Every MSS updates the request's priority to this final value, tags it <em style={{ color: COLORS.deliverable }}>deliverable</em>, and re-sorts its queue.</p>

            <p><strong style={{ color: "#f59e0b" }}>4. Serving:</strong> When a MSS holds the token, it checks its queue for the highest-priority deliverable request where the MH is local. It grants the token to that MH. The MH enters the critical section, then releases.</p>

            <p><strong style={{ color: "#f59e0b" }}>5. Cleanup:</strong> On release, the MSS broadcasts a delete message. ALL MSSs remove that request from their queues.</p>

            <h3 style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.mssDefault, marginTop: 20 }}>Why Priority Ordering Matters:</h3>
            <p>Since every MSS has a copy of every request, we need a <em>globally consistent order</em> so that all MSSs agree on which request should be served first. The two-phase priority protocol ensures this: no two MSSs will try to serve different requests simultaneously.</p>

            <h3 style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.mssDefault, marginTop: 20 }}>Key Benefit:</h3>
            <p>No location searching needed! The token circulates among MSSs, and each MSS can serve any request whose MH happens to be in its cell — because every MSS already has a copy of the request.</p>
          </div>
        </div>
      )}

      {tab === "ring" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          {/* Ring Visualization */}
          <div style={{ position: "relative", width: 360, height: 360, background: COLORS.panel, borderRadius: 16, border: `1px solid ${COLORS.panelBorder}`, overflow: "hidden" }}>
            {/* Background glow */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)` }} />

            <svg width="360" height="360" viewBox="0 0 360 360">
              {/* Ring circle */}
              <circle cx={CENTER.x} cy={CENTER.y} r={RING_RADIUS} fill="none" stroke={COLORS.ring} strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />

              {/* Ring arrows */}
              {Array.from({ length: NUM_MSS }).map((_, i) => {
                const from = getMSSPos(i);
                const to = getMSSPos((i + 1) % NUM_MSS);
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                return (
                  <line key={`arrow-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={COLORS.ring} strokeWidth="1" opacity="0.3" />
                );
              })}

              {/* MSS nodes */}
              {Array.from({ length: NUM_MSS }).map((_, i) => {
                const pos = getMSSPos(i);
                const hasToken = tokenAt === i && !animatingToken;
                const isHighlighted = highlightMSS === i;
                const localMHs = mhsByMSS[i] || [];
                return (
                  <g key={`mss-${i}`}>
                    {/* Token glow */}
                    {hasToken && (
                      <circle cx={pos.x} cy={pos.y} r="28" fill="none" stroke={COLORS.tokenGold} strokeWidth="2" opacity="0.6">
                        <animate attributeName="r" values="28;34;28" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* MSS circle */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="22"
                      fill={hasToken ? COLORS.mssToken : isHighlighted ? COLORS.mssActive : COLORS.mssDefault}
                      opacity="0.9"
                      stroke={hasToken ? COLORS.tokenGold : "transparent"}
                      strokeWidth="2"
                    />
                    <text x={pos.x} y={pos.y - 3} textAnchor="middle" fill="#fff" fontSize="9" fontFamily={FONTS.display} fontWeight="700">
                      MSS{i}
                    </text>
                    {hasToken && (
                      <text x={pos.x} y={pos.y + 9} textAnchor="middle" fill="#fff" fontSize="7" fontFamily={FONTS.display}>
                        TOKEN
                      </text>
                    )}

                    {/* MH nodes around MSS */}
                    {localMHs.map((mh, j) => {
                      const mhAngle = ((2 * Math.PI * i) / NUM_MSS - Math.PI / 2) + (j - (localMHs.length - 1) / 2) * 0.35;
                      const mhR = RING_RADIUS + 50;
                      const mhX = CENTER.x + mhR * Math.cos(mhAngle);
                      const mhY = CENTER.y + mhR * Math.sin(mhAngle);
                      const mhColor = mh.granted ? COLORS.mhGranted : mh.requesting ? COLORS.mhRequesting : COLORS.mhDefault;
                      return (
                        <g key={mh.id}>
                          <line x1={pos.x} y1={pos.y} x2={mhX} y2={mhY} stroke={mhColor} strokeWidth="1" opacity="0.4" strokeDasharray="3 2" />
                          <circle
                            cx={mhX}
                            cy={mhY}
                            r="14"
                            fill={mhColor}
                            opacity="0.85"
                            style={{ cursor: phase === "idle" && !mh.requesting && !mh.granted ? "pointer" : "default" }}
                            onClick={() => phase === "idle" && !mh.requesting && !mh.granted && handleRequest(mh.id)}
                          />
                          <text x={mhX} y={mhY - 2} textAnchor="middle" fill="#fff" fontSize="7" fontFamily={FONTS.display} fontWeight="600">
                            {mh.id}
                          </text>
                          <text x={mhX} y={mhY + 7} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="6" fontFamily={FONTS.display}>
                            h:{mh.hCount}
                          </text>
                          {mh.granted && (
                            <text x={mhX} y={mhY + 23} textAnchor="middle" fill={COLORS.mhGranted} fontSize="6" fontFamily={FONTS.display} fontWeight="700">
                              IN CS
                            </text>
                          )}
                          {mh.requesting && (
                            <text x={mhX} y={mhY + 23} textAnchor="middle" fill={COLORS.mhRequesting} fontSize="6" fontFamily={FONTS.display}>
                              REQ
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={handleServeToken} disabled={phase !== "idle"} style={{ fontFamily: FONTS.display, fontSize: 11, padding: "8px 16px", background: phase === "idle" ? COLORS.tokenGold : COLORS.panelBorder, color: phase === "idle" ? "#000" : COLORS.textMuted, border: "none", borderRadius: 8, cursor: phase === "idle" ? "pointer" : "not-allowed", fontWeight: 700, transition: "all 0.2s" }}>
              Serve / Pass Token
            </button>
            <button onClick={handleReset} style={{ fontFamily: FONTS.display, fontSize: 11, padding: "8px 16px", background: "transparent", color: COLORS.textSecondary, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, cursor: "pointer" }}>
              Reset
            </button>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", fontSize: 10, color: COLORS.textMuted, fontFamily: FONTS.display }}>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.mhDefault, marginRight: 4 }} />
              Click MH to request
            </span>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.mhRequesting, marginRight: 4 }} />
              Requesting
            </span>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.mhGranted, marginRight: 4 }} />
              In Critical Section
            </span>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.mssToken, marginRight: 4 }} />
              MSS with Token
            </span>
          </div>

          {/* Log panel */}
          <div style={{ width: "100%", maxWidth: 700, background: COLORS.logBg, borderRadius: 12, border: `1px solid ${COLORS.panelBorder}`, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.panelBorder}`, fontFamily: FONTS.display, fontSize: 11, color: COLORS.textMuted }}>
              Event Log ({logs.length} events)
            </div>
            <div style={{ maxHeight: 200, overflow: "auto", padding: 8 }}>
              {logs.length === 0 && (
                <p style={{ color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.display, textAlign: "center", margin: 16 }}>
                  Click on an MH (purple circle) to make a request, then "Serve / Pass Token" to process.
                </p>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    padding: "4px 8px",
                    fontSize: 10,
                    fontFamily: FONTS.display,
                    color:
                      log.type === "grant" ? COLORS.mhGranted :
                      log.type === "request" ? COLORS.mhRequesting :
                      log.type === "broadcast" ? COLORS.accent :
                      log.type === "priority" ? COLORS.priority :
                      log.type === "token" ? COLORS.tokenGold :
                      log.type === "deliver" ? COLORS.deliverable :
                      log.type === "release" ? "#fb923c" :
                      COLORS.textSecondary,
                    borderLeft: `2px solid ${
                      log.type === "grant" ? COLORS.mhGranted :
                      log.type === "request" ? COLORS.mhRequesting :
                      log.type === "broadcast" ? COLORS.accent :
                      log.type === "priority" ? COLORS.priority :
                      log.type === "token" ? COLORS.tokenGold :
                      log.type === "deliver" ? COLORS.deliverable :
                      log.type === "release" ? "#fb923c" :
                      COLORS.panelBorder
                    }`,
                    marginBottom: 2,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ opacity: 0.5, marginRight: 6 }}>[{i + 1}]</span>
                  {log.msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}

      {tab === "queues" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, maxWidth: 900, margin: "0 auto" }}>
          {Array.from({ length: NUM_MSS }).map((_, i) => {
            const q = queues[i] || [];
            const hasToken = tokenAt === i;
            return (
              <div
                key={i}
                style={{
                  background: COLORS.queueBg,
                  borderRadius: 10,
                  border: `1px solid ${hasToken ? COLORS.tokenGold : COLORS.panelBorder}`,
                  overflow: "hidden",
                  boxShadow: hasToken ? `0 0 20px ${COLORS.tokenGlow}` : "none",
                }}
              >
                <div style={{
                  padding: "8px 12px",
                  background: hasToken ? "rgba(245,158,11,0.15)" : "rgba(99,102,241,0.08)",
                  borderBottom: `1px solid ${COLORS.panelBorder}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, color: hasToken ? COLORS.tokenGold : COLORS.mssDefault }}>
                    MSS{i}
                  </span>
                  {hasToken && (
                    <span style={{ fontFamily: FONTS.display, fontSize: 9, background: COLORS.tokenGold, color: "#000", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                      HAS TOKEN
                    </span>
                  )}
                  <span style={{ fontFamily: FONTS.display, fontSize: 9, color: COLORS.textMuted }}>
                    Local: {(mhsByMSS[i] || []).map((m) => m.id).join(", ")}
                  </span>
                </div>

                <div style={{ padding: 8, minHeight: 60 }}>
                  {q.length === 0 ? (
                    <p style={{ color: COLORS.textMuted, fontSize: 10, fontFamily: FONTS.display, textAlign: "center", margin: 8 }}>
                      Queue empty
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: FONTS.display }}>
                      <thead>
                        <tr style={{ color: COLORS.textMuted }}>
                          <th style={{ padding: "3px 6px", textAlign: "left", borderBottom: `1px solid ${COLORS.panelBorder}` }}>#</th>
                          <th style={{ padding: "3px 6px", textAlign: "left", borderBottom: `1px solid ${COLORS.panelBorder}` }}>MH</th>
                          <th style={{ padding: "3px 6px", textAlign: "center", borderBottom: `1px solid ${COLORS.panelBorder}` }}>h_count</th>
                          <th style={{ padding: "3px 6px", textAlign: "center", borderBottom: `1px solid ${COLORS.panelBorder}` }}>Priority</th>
                          <th style={{ padding: "3px 6px", textAlign: "center", borderBottom: `1px solid ${COLORS.panelBorder}` }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.map((r, j) => {
                          const isLocal = mhs.some((m) => m.id === r.mhId && m.mssId === i);
                          return (
                            <tr key={j} style={{ background: isLocal ? "rgba(16,185,129,0.06)" : "transparent" }}>
                              <td style={{ padding: "3px 6px", color: COLORS.textMuted }}>{j + 1}</td>
                              <td style={{ padding: "3px 6px", color: COLORS.textPrimary, fontWeight: 600 }}>
                                {r.mhId} {isLocal && <span style={{ fontSize: 8, color: COLORS.mssActive }}>(local)</span>}
                              </td>
                              <td style={{ padding: "3px 6px", textAlign: "center", color: COLORS.textSecondary }}>{r.hCount}</td>
                              <td style={{ padding: "3px 6px", textAlign: "center", color: COLORS.priority, fontWeight: 700 }}>
                                {r.priority}
                                {r.tempPriority && <span style={{ fontSize: 7, color: COLORS.textMuted }}> (tmp)</span>}
                              </td>
                              <td style={{ padding: "3px 6px", textAlign: "center" }}>
                                <span style={{
                                  fontSize: 8,
                                  padding: "1px 6px",
                                  borderRadius: 6,
                                  fontWeight: 600,
                                  background: r.deliverable ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                                  color: r.deliverable ? COLORS.deliverable : COLORS.undeliverable,
                                }}>
                                  {r.deliverable ? "DELIVERABLE" : "UNDELIVERABLE"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer style={{ textAlign: "center", marginTop: 16, fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.display }}>
        Based on "Distributed Algorithms versus Mobility" — Token-Ring Mutual Exclusion, Data Replication Scheme
      </footer>
    </div>
  );
}
