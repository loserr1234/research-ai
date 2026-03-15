"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";

// ── Types ────────────────────────────────────────────────────────────────────

interface Step {
  message: string;
  done: boolean;
}

type AppState = "idle" | "researching" | "done" | "error";

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid #c7d4e8",
        borderTopColor: "#3b82f6",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Checkmark ────────────────────────────────────────────────────────────────

function Check() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: "#22c55e",
        flexShrink: 0,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M1.5 4L3.2 5.8L6.5 2.2"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
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
              // mark previous step done, add new active step
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

  const handleDownloadPdf = useCallback(async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);

    try {
      // Dynamic import keeps this browser-only (no SSR)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("html2pdf.js") as any;
      const html2pdf = (mod.default ?? mod) as typeof import("html2pdf.js");

      const filename =
        topic.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "report";

      // Build an off-screen container. Attaching it to <body> lets the browser
      // compute styles for .report-body so html2canvas captures them correctly.
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "position:fixed;left:-9999px;top:0;width:800px;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        "color:#1a1a2e;background:#fff;padding:0;";

      // Topic title
      const titleEl = document.createElement("h1");
      titleEl.textContent = topic.trim();
      titleEl.style.cssText =
        "font-size:24px;font-weight:700;margin:0 0 20px;color:#1a1a2e;line-height:1.3;";
      wrapper.appendChild(titleEl);

      // Search queries
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

      // Divider
      const hr = document.createElement("hr");
      hr.style.cssText = "border:none;border-top:1px solid #e8ecf1;margin:0 0 24px;";
      wrapper.appendChild(hr);

      // Clone the live rendered div by ID so html2canvas sees fully-painted HTML
      const reportEl = document.getElementById("report-content");
      if (reportEl) {
        wrapper.appendChild(reportEl.cloneNode(true) as HTMLElement);
      }

      // Attach to DOM so the browser computes layout + styles for the clone
      document.body.appendChild(wrapper);

      // Wait for the browser to finish laying out the newly-attached element
      // before html2canvas takes its snapshot
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clone the wrapper itself before passing so html2pdf cannot mutate
      // the node we are still tracking (avoids layout shifts during capture)
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

  const handleDownload = useCallback(() => {
    const filename = topic.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "report";
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topic, report]);

  const isResearching = appState === "researching";
  const isDone = appState === "done";
  const isError = appState === "error";
  const hasContent = steps.length > 0 || queries.length > 0 || report.length > 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8ecf1",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7.5" stroke="#3b82f6" strokeWidth="1.8" />
          <path d="M16.5 16.5L21 21" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 11h6M11 8v6" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span style={{ fontWeight: 600, fontSize: 16, color: "#1a1a2e", letterSpacing: "-0.01em" }}>
          Research AI
        </span>
      </header>

      {/* ── Search bar ── */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8ecf1",
          padding: "28px 32px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            gap: 10,
          }}
        >
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a research topic…"
            disabled={isResearching}
            style={{
              flex: 1,
              padding: "13px 18px",
              fontSize: 16,
              border: "1.5px solid #d1dae8",
              borderRadius: 10,
              outline: "none",
              background: isResearching ? "#f5f7fa" : "#fff",
              color: "#1a1a2e",
              transition: "border-color 0.15s",
              fontFamily: "inherit",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#d1dae8"; }}
          />
          <button
            onClick={handleResearch}
            disabled={isResearching || !topic.trim()}
            style={{
              padding: "13px 24px",
              background: isResearching || !topic.trim() ? "#93b4e0" : "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: isResearching || !topic.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "background 0.15s",
            }}
          >
            {isResearching ? "Researching…" : "Research"}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      {(hasContent || isError) && (
        <div
          style={{
            flex: 1,
            maxWidth: 1100,
            width: "100%",
            margin: "0 auto",
            padding: "32px 24px",
            display: "flex",
            gap: 28,
            alignItems: "flex-start",
          }}
          className="content-area"
        >
          {/* ── Sidebar ── */}
          <aside
            style={{
              width: 260,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
            className="sidebar"
          >
            {/* Progress steps */}
            {steps.length > 0 && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e8ecf1",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#8fa3bf",
                    marginBottom: 14,
                  }}
                >
                  Progress
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        animation: "fadeSlideIn 0.25s ease both",
                      }}
                    >
                      {step.done ? <Check /> : <Spinner />}
                      <span
                        style={{
                          fontSize: 13,
                          color: step.done ? "#4b5563" : "#1a1a2e",
                          lineHeight: 1.4,
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
                  background: "#fff",
                  border: "1px solid #e8ecf1",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#8fa3bf",
                    marginBottom: 12,
                  }}
                >
                  Search Queries
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {queries.map((q, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        padding: "5px 10px",
                        background: "#eef2fb",
                        color: "#2563eb",
                        borderRadius: 6,
                        fontSize: 12,
                        lineHeight: 1.4,
                        animation: `chipPop 0.2s ease ${i * 0.06}s both`,
                      }}
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── Report area ── */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {isError ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #fcd5d5",
                  borderRadius: 12,
                  padding: "28px 32px",
                  textAlign: "center",
                  animation: "fadeSlideIn 0.2s ease both",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <p style={{ fontSize: 15, color: "#b91c1c", marginBottom: 20, fontWeight: 500 }}>
                  {error}
                </p>
                <button
                  onClick={() => { reset(); }}
                  style={{
                    padding: "10px 22px",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e8ecf1",
                  borderRadius: 12,
                  padding: "32px 36px",
                  minHeight: 200,
                }}
              >
                {report ? (
                  <>
                    <div id="report-content" className="report-body">
                      <ReactMarkdown>{report}</ReactMarkdown>
                      {isResearching && (
                        <span
                          style={{
                            display: "inline-block",
                            width: 2,
                            height: "1em",
                            background: "#3b82f6",
                            marginLeft: 2,
                            verticalAlign: "text-bottom",
                            animation: "blink 1s step-start infinite",
                          }}
                        />
                      )}
                    </div>
                    {isDone && (
                      <div
                        style={{
                          marginTop: 32,
                          paddingTop: 20,
                          borderTop: "1px solid #e8ecf1",
                          display: "flex",
                          justifyContent: "flex-end",
                          animation: "fadeSlideIn 0.3s ease both",
                        }}
                      >
                        <button
                          onClick={handleDownload}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "10px 20px",
                            background: "#fff",
                            color: "#2563eb",
                            border: "1.5px solid #3b82f6",
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#eef2fb"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 3v13M7 12l5 5 5-5M4 20h16"
                              stroke="#2563eb"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          Download Report
                        </button>
                        <button
                          onClick={handleDownloadPdf}
                          disabled={pdfGenerating}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "10px 20px",
                            background: "#fff",
                            color: pdfGenerating ? "#93b4e0" : "#2563eb",
                            border: `1.5px solid ${pdfGenerating ? "#93b4e0" : "#3b82f6"}`,
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: pdfGenerating ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { if (!pdfGenerating) e.currentTarget.style.background = "#eef2fb"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                        >
                          {pdfGenerating ? (
                            <Spinner />
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <rect x="4" y="2" width="12" height="17" rx="2" stroke="#2563eb" strokeWidth="1.8" />
                              <path d="M16 2l4 4v15a1 1 0 01-1 1H5" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
                              <path d="M8 10h6M8 13h4" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          )}
                          {pdfGenerating ? "Generating…" : "Download PDF"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#8fa3bf",
                      fontSize: 14,
                    }}
                  >
                    <Spinner />
                    Generating report…
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasContent && !isError && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#8fa3bf",
            padding: "60px 24px",
            gap: 12,
            textAlign: "center",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
            <circle cx="11" cy="11" r="7.5" stroke="#8fa3bf" strokeWidth="1.5" />
            <path d="M16.5 16.5L21 21" stroke="#8fa3bf" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 11h6M11 8v6" stroke="#8fa3bf" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 16, fontWeight: 500 }}>Enter a topic to start researching</p>
          <p style={{ fontSize: 13, maxWidth: 360 }}>
            The AI will plan queries, search the web, and write a comprehensive report.
          </p>
        </div>
      )}

    </div>
  );
}
