"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step {
  message: string;
  done: boolean;
}

type AppState = "idle" | "researching" | "done" | "error";

// ── Spinner (orbital ring) ────────────────────────────────────────────────────

function Spinner() {
  return <span className="spinner-ring" />;
}

// ── Checkmark ─────────────────────────────────────────────────────────────────

function Check() {
  return (
    <span className="step-check">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M1.5 4L3.2 5.8L6.5 2.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ── Logo mark ─────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="url(#logo-g)" strokeWidth="1.8" />
      <path
        d="M16.5 16.5L21 21"
        stroke="url(#logo-g)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 11h6M11 8v6"
        stroke="url(#logo-g)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b9dff" />
          <stop offset="1" stopColor="#7c6dfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [topic, setTopic] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setAppState("idle");
    setSteps([]);
    setQueries([]);
    setReport("");
    setError("");
  }, []);

  const handleResearch = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || appState === "researching") return;

    reset();
    setAppState("researching");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("https://research-ai-0xgu.onrender.com/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: { type: string; payload: unknown };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          const { type, payload } = event;

          if (type === "status") {
            setSteps((prev) => {
              const updated = prev.map((s) => ({ ...s, done: true }));
              return [...updated, { message: payload as string, done: false }];
            });
          } else if (type === "queries") {
            setQueries(payload as string[]);
          } else if (type === "token") {
            setReport((prev) => prev + (payload as string));
          } else if (type === "done") {
            setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
            setAppState("done");
          } else if (type === "error") {
            throw new Error(payload as string);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setAppState("error");
    }
  }, [topic, appState, reset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleResearch();
    },
    [handleResearch]
  );

  const handleDownload = useCallback(() => {
    const filename =
      topic.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") ||
      "report";
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topic, report]);

  const handleDownloadPdf = useCallback(async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("html2pdf.js")) as any;
      const html2pdf = (mod.default ?? mod) as typeof import("html2pdf.js");

      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "position:fixed;left:-9999px;top:0;width:800px;" +
        "font-family:Georgia,serif;color:#1a1a2e;background:#fff;padding:0;";

      const titleEl = document.createElement("h1");
      titleEl.textContent = topic.trim();
      titleEl.style.cssText =
        "font-size:24px;font-weight:700;margin:0 0 20px;color:#1a1a2e;line-height:1.3;";
      wrapper.appendChild(titleEl);

      if (queries.length > 0) {
        const box = document.createElement("div");
        box.style.cssText =
          "margin-bottom:24px;padding:12px 16px;background:#f8f9fb;" +
          "border-radius:6px;border:1px solid #e8ecf1;";
        const label = document.createElement("p");
        label.textContent = "Search Queries";
        label.style.cssText =
          "font-size:11px;font-weight:700;letter-spacing:0.08em;" +
          "text-transform:uppercase;color:#8fa3bf;margin:0 0 10px;";
        box.appendChild(label);
        const row = document.createElement("div");
        row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
        queries.forEach((q) => {
          const chip = document.createElement("span");
          chip.textContent = q;
          chip.style.cssText =
            "display:inline-block;padding:4px 10px;background:#eef2fb;" +
            "color:#2563eb;border-radius:4px;font-size:12px;";
          row.appendChild(chip);
        });
        box.appendChild(row);
        wrapper.appendChild(box);
      }

      const hr = document.createElement("hr");
      hr.style.cssText = "border:none;border-top:1px solid #e8ecf1;margin:0 0 24px;";
      wrapper.appendChild(hr);

      const reportEl = document.getElementById("report-content");
      if (reportEl) wrapper.appendChild(reportEl.cloneNode(true) as HTMLElement);

      document.body.appendChild(wrapper);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const captureTarget = wrapper.cloneNode(true) as HTMLElement;
      document.body.appendChild(captureTarget);

      await html2pdf()
        .set({
          margin: [10, 15, 10, 15],
          filename: `${topic.trim()}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(captureTarget)
        .save();

      document.body.removeChild(captureTarget);
      document.body.removeChild(wrapper);
    } finally {
      setPdfGenerating(false);
    }
  }, [topic, queries, pdfGenerating]);

  const isResearching = appState === "researching";
  const isDone = appState === "done";
  const isError = appState === "error";
  const hasContent = steps.length > 0 || queries.length > 0 || report.length > 0;

  // Glow class for search input wrapper
  const glowClass = isResearching
    ? "search-glow-wrap glow-researching"
    : inputFocused
    ? "search-glow-wrap glow-active"
    : "search-glow-wrap";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 2,
      }}
    >
      {/* ── Animated background orbs ── */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* ── Grain texture overlay ── */}
      <div className="grain" />

      {/* ── Header ── */}
      <header
        style={{
          position: "relative",
          zIndex: 10,
          borderBottom: "1px solid var(--border)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(12px)",
          background: "rgba(7,11,20,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark />
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: "-0.02em",
              color: "var(--text-1)",
            }}
          >
            Research
            <span style={{ color: "var(--accent)", marginLeft: 2 }}>AI</span>
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-soft)",
            border: "1px solid rgba(91,157,255,0.20)",
            borderRadius: 20,
            padding: "4px 12px 4px 8px",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--success)",
              boxShadow: "0 0 6px var(--success)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "var(--text-2)",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            Live
          </span>
        </div>
      </header>

      {/* ── Search bar ── */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          borderBottom: "1px solid var(--border)",
          padding: "24px 32px",
          backdropFilter: "blur(8px)",
          background: "rgba(7,11,20,0.5)",
        }}
      >
        <div
          style={{
            maxWidth: 740,
            margin: "0 auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {/* Glowing search input (21st.dev conic border pattern) */}
          <div className={glowClass} style={{ flex: 1 }}>
            <div
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-mid)",
                borderRadius: 13,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 16px",
                transition: "border-color 0.2s",
              }}
            >
              {/* Search icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                style={{ flexShrink: 0, opacity: 0.4 }}
              >
                <circle
                  cx="11" cy="11" r="7"
                  stroke="var(--text-1)"
                  strokeWidth="1.8"
                />
                <path
                  d="M16.5 16.5L21 21"
                  stroke="var(--text-1)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Enter a research topic…"
                disabled={isResearching}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  fontSize: 15,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-1)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 400,
                }}
              />

              {/* Keyboard hint */}
              {!isResearching && topic.trim() && (
                <kbd
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    background: "var(--bg-card-2)",
                    border: "1px solid var(--border-mid)",
                    borderRadius: 5,
                    padding: "2px 7px",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ↵
                </kbd>
              )}
            </div>
          </div>

          {/* Research button */}
          <button
            onClick={handleResearch}
            disabled={isResearching || !topic.trim()}
            style={{
              padding: "14px 22px",
              background: isResearching || !topic.trim()
                ? "rgba(91,157,255,0.15)"
                : "linear-gradient(135deg, #5b9dff 0%, #7c6dfa 100%)",
              color: isResearching || !topic.trim()
                ? "rgba(91,157,255,0.45)"
                : "#fff",
              border: "1px solid",
              borderColor: isResearching || !topic.trim()
                ? "rgba(91,157,255,0.20)"
                : "transparent",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: isResearching || !topic.trim() ? "not-allowed" : "pointer",
              fontFamily: "'Sora', sans-serif",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
              boxShadow: isResearching || !topic.trim()
                ? "none"
                : "0 0 20px rgba(91,157,255,0.25)",
              transition: "all 0.2s",
            }}
          >
            {isResearching ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner />
                Researching…
              </span>
            ) : (
              "Research"
            )}
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      {(hasContent || isError) && (
        <div
          className="content-area"
          style={{
            flex: 1,
            maxWidth: 1120,
            width: "100%",
            margin: "0 auto",
            padding: "28px 24px",
            display: "flex",
            gap: 24,
            alignItems: "flex-start",
            position: "relative",
            zIndex: 5,
          }}
        >
          {/* ── Sidebar ── */}
          <aside
            className="sidebar"
            style={{
              width: 250,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Progress steps */}
            {steps.length > 0 && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "18px 20px",
                  animation: "fadeUp 0.3s ease both",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    marginBottom: 16,
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Progress
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        paddingLeft: 24,
                        paddingBottom: i < steps.length - 1 ? 16 : 0,
                        animation: `fadeUp 0.25s ease ${i * 0.06}s both`,
                      }}
                    >
                      {/* Timeline connector */}
                      {i < steps.length - 1 && (
                        <div
                          className={`step-connector${step.done ? " done" : ""}`}
                        />
                      )}

                      {/* Icon */}
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 1,
                        }}
                      >
                        {step.done ? <Check /> : <Spinner />}
                      </span>

                      <span
                        style={{
                          fontSize: 13,
                          color: step.done ? "var(--text-3)" : "var(--text-1)",
                          lineHeight: 1.4,
                          display: "block",
                          transition: "color 0.3s",
                        }}
                      >
                        {step.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Query chips */}
            {queries.length > 0 && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "18px 20px",
                  animation: "fadeUp 0.3s ease 0.1s both",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    marginBottom: 12,
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Queries
                </p>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {queries.map((q, i) => (
                    <span
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                        fontSize: 12,
                        color: "var(--text-2)",
                        lineHeight: 1.45,
                        animation: `chipIn 0.25s ease ${i * 0.07}s both`,
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          flexShrink: 0,
                          marginTop: 5,
                          opacity: 0.7,
                        }}
                      />
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── Report / main area ── */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {isError ? (
              /* Error state */
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid rgba(255,107,107,0.20)",
                  borderRadius: 14,
                  padding: "36px 40px",
                  textAlign: "center",
                  animation: "fadeUp 0.2s ease both",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--error-soft)",
                    border: "1px solid rgba(255,107,107,0.20)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                      stroke="var(--error)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--error)",
                    marginBottom: 20,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </p>
                <button
                  onClick={reset}
                  style={{
                    padding: "9px 22px",
                    background: "linear-gradient(135deg, #5b9dff 0%, #7c6dfa 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Try again
                </button>
              </div>
            ) : (
              /* Report card (liquid glass-inspired dark card from 21st.dev) */
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "32px 36px",
                  minHeight: 220,
                  boxShadow:
                    "0 0 0 1px var(--border), 0 20px 60px rgba(0,0,0,0.4)",
                  /* Subtle inner highlight at top — liquid glass feel */
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, transparent 60px)",
                  animation: "fadeUp 0.3s ease both",
                }}
              >
                {report ? (
                  <>
                    <div id="report-content" className="report-body">
                      <ReactMarkdown>{report}</ReactMarkdown>

                      {/* Blinking cursor while streaming */}
                      {isResearching && (
                        <span
                          style={{
                            display: "inline-block",
                            width: 2,
                            height: "1em",
                            background: "var(--accent)",
                            marginLeft: 2,
                            verticalAlign: "text-bottom",
                            animation: "blink 1s step-start infinite",
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </div>

                    {/* Download buttons */}
                    {isDone && (
                      <div
                        style={{
                          marginTop: 32,
                          paddingTop: 20,
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 10,
                          animation: "fadeUp 0.3s ease both",
                        }}
                      >
                        {/* Markdown download */}
                        <button
                          className="dl-btn"
                          onClick={handleDownload}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <path
                              d="M12 3v13M7 12l5 5 5-5M4 20h16"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          .md
                        </button>

                        {/* PDF download */}
                        <button
                          className="dl-btn"
                          onClick={handleDownloadPdf}
                          disabled={pdfGenerating}
                        >
                          {pdfGenerating ? (
                            <Spinner />
                          ) : (
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <rect
                                x="4"
                                y="2"
                                width="12"
                                height="17"
                                rx="2"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                              <path
                                d="M16 2l4 4v15a1 1 0 01-1 1H5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                              <path
                                d="M8 10h6M8 13h4"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                          {pdfGenerating ? "Generating…" : ".pdf"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  /* Generating placeholder */
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      padding: "8px 0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        color: "var(--text-3)",
                        fontSize: 14,
                      }}
                    >
                      <Spinner />
                      <span>Generating report…</span>
                    </div>

                    {/* Skeleton shimmer lines */}
                    {[100, 85, 92, 70].map((w, i) => (
                      <div
                        key={i}
                        style={{
                          height: 12,
                          width: `${w}%`,
                          borderRadius: 6,
                          background:
                            "linear-gradient(90deg, var(--bg-card-2) 25%, var(--border-mid) 50%, var(--bg-card-2) 75%)",
                          backgroundSize: "200% 100%",
                          animation: `shimmer 1.8s ease-in-out ${i * 0.15}s infinite`,
                          opacity: 0.5,
                        }}
                      />
                    ))}

                    <style>{`
                      @keyframes shimmer {
                        0%   { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                      }
                    `}</style>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── Hero / empty state ── */}
      {!hasContent && !isError && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 24px",
            gap: 0,
            position: "relative",
            zIndex: 5,
            animation: "heroIn 0.6s ease both",
          }}
        >
          {/* Large decorative search icon */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "var(--bg-card)",
              border: "1px solid var(--border-mid)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
              boxShadow: "0 0 40px var(--accent-glow)",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="url(#hero-g)"
                strokeWidth="1.6"
              />
              <path
                d="M16.5 16.5L21 21"
                stroke="url(#hero-g)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M8 11h6M11 8v6"
                stroke="url(#hero-g)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient
                  id="hero-g"
                  x1="0" y1="0" x2="24" y2="24"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#5b9dff" />
                  <stop offset="1" stopColor="#7c6dfa" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              color: "var(--text-1)",
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            What do you want to research?
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "var(--text-3)",
              maxWidth: 380,
              textAlign: "center",
              lineHeight: 1.7,
              marginBottom: 40,
            }}
          >
            Enter any topic above. The AI plans targeted queries, searches the web in parallel, and writes a comprehensive report.
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { icon: "⚡", label: "Parallel search" },
              { icon: "📝", label: "Streamed report" },
              { icon: "⬇", label: "PDF & Markdown" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 12,
                  color: "var(--text-3)",
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 13 }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
