import React, { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "./ReferencePanel.css";
import { speak } from "../utils/speak";
import { VM } from "../utils/voiceMessages";

// Use CDN worker to avoid Vite bundling issues with the WASM/worker file
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000/";

// ── Highlight helper ──────────────────────────────────────────────────────────
function HighlightedText({ text, query }) {
  if (!text) return <p className="rp-empty">No excerpt available for this source.</p>;

  const words = (query || "")
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter((w) => w.length > 2);

  if (!words.length) return <p className="rp-text">{text}</p>;

  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  const parts   = text.split(pattern);

  return (
    <p className="rp-text">
      {parts.map((part, i) =>
        pattern.test(part)
          ? <mark key={i} className="rp-highlight">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </p>
  );
}

// ── PDF page renderer ─────────────────────────────────────────────────────────
function PdfPreview({ pdfUrl, snippet, initialPage }) {
  const canvasRef  = useRef(null);
  const [pageNum,   setPageNum]  = useState(null);   // best-match page
  const [totalPages, setTotal]   = useState(0);
  const [loading,   setLoading]  = useState(true);
  const [error,     setError]    = useState(null);

  const pdfDocRef = useRef(null);   // keep the loaded doc

  // Derive highlight words from the snippet (words longer than 3 chars)
  const highlightWords = useRef([]);
  useEffect(() => {
    highlightWords.current = (snippet || "")
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 3);
  }, [snippet]);

  const renderPage = useCallback(async (doc, num, words) => {
    if (!canvasRef.current) return;
    const page     = await doc.getPage(num);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas   = canvasRef.current;
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx      = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // ── Overlay text highlights ──────────────────────────────────────────
    const activeWords = words ?? highlightWords.current;
    if (activeWords.length > 0) {
      try {
        const textContent = await page.getTextContent();
        ctx.save();
        for (const item of textContent.items) {
          if (!item.str?.trim()) continue;
          const lower = item.str.toLowerCase();
          if (!activeWords.some((w) => lower.includes(w))) continue;

          // Convert PDF baseline point → canvas coordinates
          const [cx, cy] = viewport.convertToViewportPoint(
            item.transform[4],
            item.transform[5],
          );
          const fontSize = Math.abs(item.transform[3]) * viewport.scale;
          const itemW    = item.width * viewport.scale;

          ctx.fillStyle = "rgba(251, 191, 36, 0.38)";
          ctx.fillRect(cx, cy - fontSize, itemW, fontSize * 1.25);
        }
        ctx.restore();
      } catch (_) {
        // Highlight failure is non-fatal; page is still shown
      }
    }
  }, []);

  const goToPage = async (delta) => {
    const next = pageNum + delta;
    if (!pdfDocRef.current || next < 1 || next > totalPages) return;
    setLoading(true);
    try {
      await renderPage(pdfDocRef.current, next, highlightWords.current);
      setPageNum(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const doc   = await pdfjsLib.getDocument(pdfUrl).promise;
        pdfDocRef.current = doc;
        const total = doc.numPages;
        if (!cancelled) setTotal(total);

        const pageHint = Number(initialPage);
        if (Number.isInteger(pageHint) && pageHint >= 1 && pageHint <= total) {
          if (cancelled) return;
          setPageNum(pageHint);
          await renderPage(doc, pageHint, highlightWords.current);
          return;
        }

        // ── Find best page by snippet word overlap ──────────────────────
        const searchText   = (snippet || "").slice(0, 200).toLowerCase();
        const searchWords  = searchText.split(/\s+/).filter((w) => w.length > 3);
        let bestPage = 1, bestScore = -1;

        const scanLimit = Math.min(total, 40);
        for (let i = 1; i <= scanLimit; i++) {
          const page    = await doc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((it) => it.str).join(" ").toLowerCase();
          const score   = searchWords.filter((w) => pageText.includes(w)).length;
          if (score > bestScore) { bestScore = score; bestPage = i; }
        }

        if (cancelled) return;
        setPageNum(bestPage);
        await renderPage(doc, bestPage, highlightWords.current);
      } catch (e) {
        if (!cancelled) setError("Could not load PDF preview.");
        console.error("[PdfPreview]", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, snippet, initialPage, renderPage]);

  return (
    <div className="rp-pdf-wrapper">
      {loading && (
        <div className="rp-pdf-loading">
          <span className="rp-pdf-spinner" />
          Loading PDF preview…
        </div>
      )}
      {error && <div className="rp-pdf-error">{error}</div>}

      <canvas
        ref={canvasRef}
        className="rp-pdf-canvas"
        style={{ display: loading || error ? "none" : "block" }}
      />

      {!loading && !error && totalPages > 0 && (
        <div className="rp-pdf-nav">
          <button className="rp-pdf-nav-btn" onClick={() => goToPage(-1)} disabled={pageNum <= 1}>
            ‹
          </button>
          <span className="rp-pdf-page-label">Page {pageNum} of {totalPages}</span>
          <button className="rp-pdf-nav-btn" onClick={() => goToPage(1)} disabled={pageNum >= totalPages}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

// ── ReferencePanel ────────────────────────────────────────────────────────────
export default function ReferencePanel({ reference, query, lang = "en", onClose }) {
  const panelRef = useRef(null);

  useEffect(() => { panelRef.current?.focus(); }, []);

  useEffect(() => {
    if (reference?.title) {
      speak(VM.refOpened(reference.title, lang), { rate: 0.88, lang });
    }
  }, [reference, lang]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!reference) return null;

  const kind  = reference.kind  ?? (reference.is_web ? "external" : "chunk");
  const isPdf = kind === "pdf" && reference.pdf_url;
  const isWeb = kind === "external" || reference.is_web;

  const pdfFullUrl = isPdf
    ? `${BACKEND.replace(/\/$/, "")}${reference.pdf_url}`
    : null;

  return (
    <>
      <div className="rp-overlay" onClick={onClose} aria-hidden="true" />

      <aside
        className="rp-panel"
        ref={panelRef}
        tabIndex={-1}
        role="complementary"
        aria-label="Source reference"
      >
        {/* Header */}
        <div className="rp-header">
          <div className="rp-header-left">
            <span className="rp-type-icon">{isPdf ? "📄" : isWeb ? "🌐" : "📋"}</span>
            <span className="rp-type-label">
              {isPdf ? "Knowledge Base PDF" : isWeb ? "External Source" : "Knowledge Base"}
            </span>
          </div>
          <button className="rp-close" onClick={onClose} aria-label="Close reference panel">✕</button>
        </div>

        {/* Document title */}
        <div className="rp-title-block">
          <h2 className="rp-doc-title">{reference.title || "Source Document"}</h2>
          {isPdf && (
            <span className="rp-pdf-badge">📑 {reference.pdf_filename}</span>
          )}
        </div>

        <div className="rp-divider" />

        {/* Body */}
        <div className="rp-body">
          {isPdf ? (
            /* ── PDF rendering mode ── */
            <>
              <PdfPreview
                pdfUrl={pdfFullUrl}
                snippet={reference.snippet}
                initialPage={reference.page_number}
              />
              {reference.snippet && (
                <div className="rp-excerpt-section">
                  <p className="rp-excerpt-label">
                    Relevant excerpt
                    {query && <> — terms from: <em>{query.slice(0, 60)}{query.length > 60 ? "…" : ""}</em></>}
                  </p>
                  <div className="rp-chunk-box">
                    <HighlightedText text={reference.snippet} query={query} />
                  </div>
                </div>
              )}
            </>
          ) : isWeb ? (
            /* ── Web / external source mode ── */
            <div className="rp-web-block">
              <p className="rp-web-label">Visit the source:</p>
              <a
                href={reference.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="rp-web-link"
              >
                {reference.uri}
              </a>
              {reference.snippet && (
                <>
                  <p className="rp-excerpt-label">Excerpt used:</p>
                  <HighlightedText text={reference.snippet} query={query} />
                </>
              )}
            </div>
          ) : (
            /* ── Plain chunk (no local PDF matched) ── */
            <>
              {query && (
                <p className="rp-excerpt-label">
                  Highlighted terms from your query:&nbsp;<em>{query}</em>
                </p>
              )}
              <div className="rp-chunk-box">
                <HighlightedText text={reference.snippet} query={query} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="rp-footer">
          {isPdf && pdfFullUrl && (
            <a
              href={pdfFullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rp-open-pdf-btn"
            >
              Open PDF ↗
            </a>
          )}
          <button className="rp-close-btn" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
