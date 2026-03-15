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
        <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="white" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Home() {
  const [topic, setTopic]                 = useState("");
  const [appState, setAppState]           = useState<AppState>("idle");
  const [steps, setSteps]                 = useState<Step[]>([]);
  const [queries, setQueries]             = useState<string[]>([]);
  const [report, setReport]               = useState("");
  const [error, setError]                 = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [focused, setFocused]             = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setAppState("idle"); setSteps([]); setQueries([]); setReport(""); setError("");
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
            setSteps(prev => [...prev.map(s => ({ ...s, done: true })), { message: payload as string, done: false }]);
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
    (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") handleResearch(); },
    [handleResearch]
  );

  const handleDownload = useCallback(() => {
    const name = topic.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "report";
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.md`; a.click();
    URL.revokeObjectURL(url);
  }, [topic, report]);

  const handleDownloadPdf = useCallback(async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("html2pdf.js")) as any;
      const html2pdf = (mod.default ?? mod) as typeof import("html2pdf.js");

      // Build wrapper with fully explicit inline styles — no CSS vars or classes,
      // because html2canvas cannot resolve CSS custom properties off-screen.
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "position:fixed;left:-9999px;top:0;width:800px;padding:40px;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        "font-size:14px;line-height:1.75;color:#374151;background:#ffffff;";

      // Title
      const title = document.createElement("h1");
      title.textContent = topic.trim();
      title.style.cssText =
        "font-size:24px;font-weight:700;color:#111827;margin:0 0 20px;" +
        "letter-spacing:-0.02em;padding-bottom:16px;border-bottom:2px solid #e5e7eb;";
      wrapper.appendChild(title);

      // Queries
      if (queries.length > 0) {
        const box = document.createElement("div");
        box.style.cssText =
          "margin-bottom:24px;padding:14px 18px;background:#f9fafb;" +
          "border-radius:8px;border:1px solid #e5e7eb;";
        const label = document.createElement("p");
        label.textContent = "Search Queries";
        label.style.cssText =
          "font-size:10px;font-weight:600;text-transform:uppercase;" +
          "letter-spacing:0.08em;color:#9ca3af;margin:0 0 10px;";
        box.appendChild(label);
        queries.forEach(q => {
          const chip = document.createElement("span");
          chip.textContent = q;
          chip.style.cssText =
            "display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;" +
            "background:#eef2ff;color:#4f6ef7;border-radius:4px;font-size:12px;font-weight:500;";
          box.appendChild(chip);
        });
        wrapper.appendChild(box);
      }

      // Report content — clone innerHTML and re-style every element explicitly
      // so html2canvas captures real computed colors instead of unresolved vars.
      const reportEl = document.getElementById("report-content");
      if (reportEl) {
        const content = document.createElement("div");
        content.innerHTML = reportEl.innerHTML;
        content.style.cssText = "color:#374151;font-size:14px;line-height:1.75;";

        content.querySelectorAll<HTMLElement>("h1").forEach(h => {
          h.style.cssText = "font-size:20px;font-weight:700;color:#111827;margin:0 0 14px;letter-spacing:-0.01em;";
        });
        content.querySelectorAll<HTMLElement>("h2").forEach(h => {
          h.style.cssText = "font-size:16px;font-weight:600;color:#111827;margin:24px 0 8px;";
        });
        content.querySelectorAll<HTMLElement>("h3").forEach(h => {
          h.style.cssText = "font-size:13px;font-weight:600;color:#6b7280;margin:18px 0 6px;";
        });
        content.querySelectorAll<HTMLElement>("p").forEach(p => {
          p.style.cssText = "margin:0 0 12px;color:#374151;";
        });
        content.querySelectorAll<HTMLElement>("ul,ol").forEach(l => {
          l.style.cssText = "padding-left:22px;margin:0 0 12px;color:#374151;";
        });
        content.querySelectorAll<HTMLElement>("li").forEach(li => {
          li.style.cssText = "margin-bottom:5px;color:#374151;";
        });
        content.querySelectorAll<HTMLElement>("strong").forEach(s => {
          s.style.cssText = "font-weight:600;color:#111827;";
        });
        content.querySelectorAll<HTMLElement>("a").forEach(a => {
          a.style.cssText = "color:#4f6ef7;text-decoration:none;";
        });
        content.querySelectorAll<HTMLElement>("code").forEach(c => {
          c.style.cssText =
            "font-family:'SF Mono',Menlo,monospace;font-size:12px;" +
            "background:#f3f4f6;color:#4f6ef7;padding:1px 5px;border-radius:3px;";
        });
        content.querySelectorAll<HTMLElement>("blockquote").forEach(b => {
          b.style.cssText =
            "border-left:3px solid #e5e7eb;padding:4px 16px;color:#9ca3af;" +
            "margin:0 0 12px;font-style:italic;";
        });
        content.querySelectorAll<HTMLElement>("hr").forEach(hr => {
          hr.style.cssText = "border:none;border-top:1px solid #e5e7eb;margin:20px 0;";
        });
        wrapper.appendChild(content);
      }

      document.body.appendChild(wrapper);
      await new Promise(r => setTimeout(r, 300));
      const target = wrapper.cloneNode(true) as HTMLElement;
      document.body.appendChild(target);

      await html2pdf().set({
        margin: [10, 15, 10, 15],
        filename: `${topic.trim()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(target).save();

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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-subtle)" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        padding: "0 28px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 0 var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: 8,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/>
              <path d="M16.5 16.5L21 21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 11h6M11 8v6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.01em" }}>
            Research AI
          </span>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }}/>
          <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>Online</span>
        </div>
      </header>

      {/* ── Hero search ────────────────────────────────────────────────── */}
      {!hasContent && !isError && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px",
          animation: "fadeUp 0.4s ease both",
        }}>
          <h1 style={{
            fontSize: 36,
            fontWeight: 700,
            color: "var(--text-1)",
            letterSpacing: "-0.03em",
            marginBottom: 10,
            textAlign: "center",
            lineHeight: 1.2,
          }}>
            Research anything, instantly
          </h1>
          <p style={{
            fontSize: 16,
            color: "var(--text-2)",
            marginBottom: 32,
            textAlign: "center",
            maxWidth: 420,
            lineHeight: 1.6,
          }}>
            Type a topic and get a comprehensive, sourced report in seconds — powered by AI.
          </p>

          {/* Main search box */}
          <div style={{
            width: "100%",
            maxWidth: 600,
            background: "var(--bg)",
            border: `1.5px solid ${focused ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 14,
            boxShadow: focused
              ? "0 0 0 4px rgba(79,110,247,0.10), var(--shadow-md)"
              : "var(--shadow-md)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" stroke="var(--text-1)" strokeWidth="2"/>
              <path d="M16.5 16.5L21 21" stroke="var(--text-1)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="e.g. Best laptops for developers in 2026…"
              disabled={isResearching}
              style={{
                flex: 1,
                padding: "18px 0",
                fontSize: 15,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-1)",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleResearch}
              disabled={isResearching || !topic.trim()}
              style={{
                padding: "9px 20px",
                background: isResearching || !topic.trim() ? "var(--bg-subtle)" : "var(--accent)",
                color: isResearching || !topic.trim() ? "var(--text-3)" : "#fff",
                border: "1px solid",
                borderColor: isResearching || !topic.trim() ? "var(--border)" : "transparent",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: isResearching || !topic.trim() ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 7,
                transition: "all 0.15s",
              }}
            >
              {isResearching ? <><Spinner /> Working…</> : "Research →"}
            </button>
          </div>

          {/* Suggestion chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 20 }}>
            {[
              "AI trends in 2026",
              "Best programming languages",
              "Climate change solutions",
              "Remote work productivity",
            ].map(s => (
              <button
                key={s}
                onClick={() => { setTopic(s); }}
                style={{
                  padding: "6px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  fontSize: 13,
                  color: "var(--text-2)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  boxShadow: "var(--shadow-sm)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-2)";
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Feature row */}
          <div style={{ display: "flex", gap: 32, marginTop: 48, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { icon: "⚡", label: "Parallel search" },
              { icon: "📄", label: "Full report" },
              { icon: "⬇️", label: "Export to PDF" },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-3)" }}>
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Compact search bar (shown during/after research) ────────────── */}
      {(hasContent || isError) && (
        <>
          <div style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
            padding: "14px 28px",
          }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 8 }}>
              <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--bg-subtle)",
                border: `1.5px solid ${focused ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 10,
                padding: "0 14px",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: focused ? "0 0 0 3px rgba(79,110,247,0.10)" : "none",
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
                  placeholder="New topic…"
                  disabled={isResearching}
                  style={{
                    flex: 1, padding: "11px 0", fontSize: 14,
                    background: "transparent", border: "none", outline: "none",
                    color: "var(--text-1)", fontFamily: "inherit",
                  }}
                />
              </div>
              <button
                onClick={handleResearch}
                disabled={isResearching || !topic.trim()}
                style={{
                  padding: "0 18px",
                  background: isResearching || !topic.trim() ? "var(--bg-subtle)" : "var(--accent)",
                  color: isResearching || !topic.trim() ? "var(--text-3)" : "#fff",
                  border: "1px solid",
                  borderColor: isResearching || !topic.trim() ? "var(--border)" : "transparent",
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                  cursor: isResearching || !topic.trim() ? "not-allowed" : "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s",
                }}
              >
                {isResearching ? <><Spinner /> Working…</> : "Research →"}
              </button>
            </div>
          </div>

          {/* ── Content layout ─────────────────────────────────────────── */}
          <div
            className="content-area"
            style={{
              flex: 1,
              maxWidth: 1100,
              width: "100%",
              margin: "0 auto",
              padding: "24px 28px",
              display: "flex",
              gap: 20,
              alignItems: "flex-start",
            }}
          >
            {/* Sidebar */}
            <aside className="sidebar" style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

              {steps.length > 0 && (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "16px",
                  boxShadow: "var(--shadow-sm)",
                  animation: "fadeUp 0.25s ease both",
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 14 }}>
                    Progress
                  </p>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {steps.map((step, i) => (
                      <div key={i} style={{
                        position: "relative",
                        paddingLeft: 24,
                        paddingBottom: i < steps.length - 1 ? 14 : 0,
                        animation: `fadeUp 0.2s ease ${i * 0.05}s both`,
                      }}>
                        {i < steps.length - 1 && (
                          <div style={{
                            position: "absolute", left: 7, top: 18, bottom: -2,
                            width: 1,
                            background: step.done ? "#bbf7d0" : "var(--border)",
                            transition: "background 0.4s",
                          }}/>
                        )}
                        <span style={{ position: "absolute", left: 0, top: 1 }}>
                          {step.done ? <Check /> : <Spinner />}
                        </span>
                        <span style={{
                          fontSize: 13,
                          color: step.done ? "var(--text-3)" : "var(--text-1)",
                          lineHeight: 1.45, display: "block", transition: "color 0.3s",
                        }}>
                          {step.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {queries.length > 0 && (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "16px",
                  boxShadow: "var(--shadow-sm)",
                  animation: "fadeUp 0.25s ease 0.05s both",
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
                    Queries
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {queries.map((q, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        animation: `fadeUp 0.2s ease ${i * 0.06}s both`,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: "var(--accent)", flexShrink: 0,
                          marginTop: 5, opacity: 0.5,
                        }}/>
                        <span style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* Report */}
            <main style={{ flex: 1, minWidth: 0 }}>
              {isError ? (
                <div style={{
                  background: "var(--bg)", border: "1px solid #fecaca", borderRadius: "var(--radius)",
                  padding: "32px", textAlign: "center", boxShadow: "var(--shadow-sm)",
                  animation: "fadeUp 0.2s ease both",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", background: "#fef2f2",
                    border: "1px solid #fecaca", display: "flex", alignItems: "center",
                    justifyContent: "center", margin: "0 auto 14px",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 8v4m0 4h.01" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="12" r="10" stroke="#dc2626" strokeWidth="1.8"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--error)", marginBottom: 16 }}>{error}</p>
                  <button onClick={reset} style={{
                    padding: "8px 18px", background: "var(--accent)", color: "#fff",
                    border: "none", borderRadius: "var(--radius)", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    Try again
                  </button>
                </div>
              ) : (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "28px 32px",
                  minHeight: 200,
                  boxShadow: "var(--shadow-sm)",
                  animation: "fadeUp 0.25s ease both",
                }}>
                  {report ? (
                    <>
                      <div id="report-content" className="report-body">
                        <ReactMarkdown>{report}</ReactMarkdown>
                        {isResearching && (
                          <span style={{
                            display: "inline-block", width: 2, height: "1em",
                            background: "var(--accent)", marginLeft: 2,
                            verticalAlign: "text-bottom",
                            animation: "blink 1s step-start infinite", borderRadius: 1,
                          }}/>
                        )}
                      </div>

                      {isDone && (
                        <div style={{
                          marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--border)",
                          display: "flex", justifyContent: "flex-end", gap: 8,
                          animation: "fadeIn 0.3s ease both",
                        }}>
                          <button className="dl-btn" onClick={handleDownload}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path d="M12 3v13M7 12l5 5 5-5M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Export Markdown
                          </button>
                          <button className="dl-btn" onClick={handleDownloadPdf} disabled={pdfGenerating}>
                            {pdfGenerating ? <Spinner /> : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                              </svg>
                            )}
                            {pdfGenerating ? "Generating…" : "Export PDF"}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <Spinner />
                        <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>Writing your report…</span>
                      </div>
                      {[90, 70, 82, 55, 75].map((w, i) => (
                        <div key={i} style={{
                          height: 12, width: `${w}%`, borderRadius: 6,
                          background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                          backgroundSize: "200% 100%",
                          animation: `shimmer 1.5s ease-in-out ${i * 0.1}s infinite`,
                        }}/>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
