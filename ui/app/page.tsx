"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface Step {
  message: string;
  done: boolean;
}

type AppState = "idle" | "researching" | "done" | "error";

function Spinner() {
  return <span className="spinner" />;
}

function Check() {
  return (
    <span className="step-check">
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

export default function Home() {
  const [topic, setTopic]               = useState("");
  const [appState, setAppState]         = useState<AppState>("idle");
  const [steps, setSteps]               = useState<Step[]>([]);
  const [queries, setQueries]           = useState<string[]>([]);
  const [report, setReport]             = useState("");
  const [error, setError]               = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [focused, setFocused]           = useState(false);
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

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

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
          try { event = JSON.parse(raw); } catch { continue; }

          const { type, payload } = event;

          if (type === "status") {
            setSteps(prev => [
              ...prev.map(s => ({ ...s, done: true })),
              { message: payload as string, done: false },
            ]);
          } else if (type === "queries") {
            setQueries(payload as string[]);
          } else if (type === "token") {
            setReport(prev => prev + (payload as string));
          } else if (type === "done") {
            setSteps(prev => prev.map(s => ({ ...s, done: true })));
            setAppState("done");
          } else if (type === "error") {
            throw new Error(payload as string);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
    const name = topic.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "report";
    const blob = new Blob([report], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topic, report]);

  const handleDownloadPdf = useCallback(async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod      = (await import("html2pdf.js")) as any;
      const html2pdf = (mod.default ?? mod) as typeof import("html2pdf.js");

      const wrapper  = document.createElement("div");
      wrapper.style.cssText =
        "position:fixed;left:-9999px;top:0;width:800px;" +
        "font-family:-apple-system,sans-serif;color:#111;background:#fff;padding:0;";

      const title = document.createElement("h1");
      title.textContent = topic.trim();
      title.style.cssText = "font-size:22px;font-weight:600;margin:0 0 20px;";
      wrapper.appendChild(title);

      if (queries.length > 0) {
        const box = document.createElement("div");
        box.style.cssText =
          "margin-bottom:20px;padding:12px 16px;background:#f5f5f5;border-radius:6px;";
        const label = document.createElement("p");
        label.textContent = "Search Queries";
        label.style.cssText =
          "font-size:10px;font-weight:600;text-transform:uppercase;" +
          "letter-spacing:0.07em;color:#888;margin:0 0 8px;";
        box.appendChild(label);
        queries.forEach(q => {
          const chip = document.createElement("span");
          chip.textContent = q;
          chip.style.cssText =
            "display:inline-block;margin:2px 4px 2px 0;padding:3px 9px;" +
            "background:#e8e8e8;border-radius:4px;font-size:12px;color:#333;";
          box.appendChild(chip);
        });
        wrapper.appendChild(box);
      }

      const hr = document.createElement("hr");
      hr.style.cssText = "border:none;border-top:1px solid #e5e5e5;margin:0 0 20px;";
      wrapper.appendChild(hr);

      const el = document.getElementById("report-content");
      if (el) wrapper.appendChild(el.cloneNode(true) as HTMLElement);

      document.body.appendChild(wrapper);
      await new Promise(r => setTimeout(r, 500));

      const target = wrapper.cloneNode(true) as HTMLElement;
      document.body.appendChild(target);

      await html2pdf()
        .set({
          margin: [10, 15, 10, 15],
          filename: `${topic.trim()}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(target)
        .save();

      document.body.removeChild(target);
      document.body.removeChild(wrapper);
    } finally {
      setPdfGenerating(false);
    }
  }, [topic, queries, pdfGenerating]);

  const isResearching = appState === "researching";
  const isDone        = appState === "done";
  const isError       = appState === "error";
  const hasContent    = steps.length > 0 || queries.length > 0 || report.length > 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 32px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--text-1)" strokeWidth="1.6"/>
            <path d="M16.5 16.5L21 21" stroke="var(--text-1)" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M8 11h6M11 8v6" stroke="var(--text-1)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-1)",
            letterSpacing: "-0.01em",
          }}>
            Research AI
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 6, height: 6,
            borderRadius: "50%",
            background: "var(--success)",
            display: "inline-block",
          }}/>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>Live</span>
        </div>
      </header>

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        padding: "20px 32px",
        background: "var(--bg)",
      }}>
        <div style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          gap: 8,
        }}>
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-subtle)",
            border: `1px solid ${focused ? "var(--border-hi)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            padding: "0 14px",
            transition: "border-color 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" stroke="var(--text-1)" strokeWidth="2"/>
              <path d="M16.5 16.5L21 21" stroke="var(--text-1)" strokeWidth="2" strokeLinecap="round"/>
            </svg>

            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Enter a research topic…"
              disabled={isResearching}
              style={{
                flex: 1,
                padding: "12px 0",
                fontSize: 14,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-1)",
                fontFamily: "inherit",
              }}
            />

            {topic.trim() && !isResearching && (
              <kbd style={{
                fontSize: 11,
                color: "var(--text-3)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-mid)",
                borderRadius: 4,
                padding: "2px 6px",
                fontFamily: "inherit",
                flexShrink: 0,
              }}>
                ↵
              </kbd>
            )}
          </div>

          <button
            onClick={handleResearch}
            disabled={isResearching || !topic.trim()}
            style={{
              padding: "0 18px",
              height: 42,
              background: isResearching || !topic.trim() ? "var(--bg-elevated)" : "var(--text-1)",
              color: isResearching || !topic.trim() ? "var(--text-3)" : "var(--bg)",
              border: "1px solid",
              borderColor: isResearching || !topic.trim() ? "var(--border)" : "transparent",
              borderRadius: "var(--radius)",
              fontSize: 13,
              fontWeight: 500,
              cursor: isResearching || !topic.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.15s",
            }}
          >
            {isResearching ? <><Spinner /> Researching…</> : "Research"}
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {(hasContent || isError) && (
        <div
          className="content-area"
          style={{
            flex: 1,
            maxWidth: 1100,
            width: "100%",
            margin: "0 auto",
            padding: "28px 24px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside className="sidebar" style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Steps */}
            {steps.length > 0 && (
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "16px",
                animation: "fadeUp 0.2s ease both",
              }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 14,
                }}>
                  Progress
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {steps.map((step, i) => (
                    <div key={i} style={{
                      position: "relative",
                      paddingLeft: 22,
                      paddingBottom: i < steps.length - 1 ? 14 : 0,
                      animation: `fadeUp 0.2s ease ${i * 0.05}s both`,
                    }}>
                      {/* connector line */}
                      {i < steps.length - 1 && (
                        <div style={{
                          position: "absolute",
                          left: 6,
                          top: 16,
                          bottom: -2,
                          width: 1,
                          background: step.done ? "var(--border-hi)" : "var(--border)",
                          transition: "background 0.4s",
                        }}/>
                      )}

                      <span style={{ position: "absolute", left: 0, top: 1 }}>
                        {step.done ? <Check /> : <Spinner />}
                      </span>

                      <span style={{
                        fontSize: 12.5,
                        color: step.done ? "var(--text-3)" : "var(--text-2)",
                        lineHeight: 1.45,
                        display: "block",
                        transition: "color 0.3s",
                      }}>
                        {step.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queries */}
            {queries.length > 0 && (
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "16px",
                animation: "fadeUp 0.2s ease 0.05s both",
              }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 12,
                }}>
                  Queries
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {queries.map((q, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      animation: `fadeUp 0.2s ease ${i * 0.06}s both`,
                    }}>
                      <span style={{
                        width: 3,
                        height: 3,
                        borderRadius: "50%",
                        background: "var(--border-hi)",
                        flexShrink: 0,
                        marginTop: 6,
                      }}/>
                      <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
                        {q}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── Report ──────────────────────────────────────────────────── */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {isError ? (
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "32px",
                animation: "fadeUp 0.2s ease both",
                textAlign: "center",
              }}>
                <p style={{ fontSize: 13, color: "var(--error)", marginBottom: 16 }}>
                  {error}
                </p>
                <button
                  onClick={reset}
                  style={{
                    padding: "7px 16px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-1)",
                    border: "1px solid var(--border-mid)",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "28px 32px",
                minHeight: 200,
                animation: "fadeUp 0.2s ease both",
              }}>
                {report ? (
                  <>
                    <div id="report-content" className="report-body">
                      <ReactMarkdown>{report}</ReactMarkdown>
                      {isResearching && (
                        <span style={{
                          display: "inline-block",
                          width: 2,
                          height: "1em",
                          background: "var(--text-2)",
                          marginLeft: 2,
                          verticalAlign: "text-bottom",
                          animation: "blink 1s step-start infinite",
                          borderRadius: 1,
                        }}/>
                      )}
                    </div>

                    {isDone && (
                      <div style={{
                        marginTop: 28,
                        paddingTop: 16,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                        animation: "fadeIn 0.3s ease both",
                      }}>
                        <button className="dl-btn" onClick={handleDownload}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M12 3v13M7 12l5 5 5-5M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Markdown
                        </button>
                        <button className="dl-btn" onClick={handleDownloadPdf} disabled={pdfGenerating}>
                          {pdfGenerating ? <Spinner /> : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            </svg>
                          )}
                          {pdfGenerating ? "Generating…" : "PDF"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  /* skeleton while waiting for first token */
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Spinner />
                      <span style={{ fontSize: 13, color: "var(--text-3)" }}>Generating report…</span>
                    </div>
                    {[90, 75, 85, 60, 80].map((w, i) => (
                      <div key={i} style={{
                        height: 11,
                        width: `${w}%`,
                        borderRadius: 4,
                        background: `linear-gradient(90deg, var(--bg-elevated) 25%, var(--border-mid) 50%, var(--bg-elevated) 75%)`,
                        backgroundSize: "200% 100%",
                        animation: `shimmer 1.6s ease-in-out ${i * 0.1}s infinite`,
                      }}/>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!hasContent && !isError && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          animation: "fadeUp 0.4s ease both",
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: "1px solid var(--border-mid)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="var(--text-2)" strokeWidth="1.6"/>
              <path d="M16.5 16.5L21 21" stroke="var(--text-2)" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M8 11h6M11 8v6" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          <p style={{
            fontSize: 15,
            fontWeight: 500,
            color: "var(--text-1)",
            marginBottom: 8,
            letterSpacing: "-0.01em",
          }}>
            Enter a topic to get started
          </p>

          <p style={{
            fontSize: 13,
            color: "var(--text-3)",
            maxWidth: 340,
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            The AI plans search queries, researches in parallel, and writes a comprehensive report.
          </p>
        </div>
      )}
    </div>
  );
}
