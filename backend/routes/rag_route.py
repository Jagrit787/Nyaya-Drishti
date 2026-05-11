import time
import re
import logging
import os
from pathlib import Path
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from services.orchestrator import route_query
from services.rag_pipline import query_with_fallback, answer_general, answer_small_talk
from services.text_formatter import clean_for_display, clean_for_speech

log = logging.getLogger(__name__)

rag_bp = Blueprint("rag", __name__)

# ── PDF serving ───────────────────────────────────────────────────────────────
_DEFAULT_PDF_DIR = Path(__file__).resolve().parents[1] / "data" / "pdfs"
_PDF_DIR = Path(os.environ.get("PDF_DATA_DIR", str(_DEFAULT_PDF_DIR)))
_PDF_WHITELIST: set = set()
_PDF_TOKENS: dict   = {}  # {frozenset_of_tokens: filename}

def _build_pdf_index():
    global _PDF_WHITELIST, _PDF_TOKENS
    if not _PDF_DIR.exists():
        return
    for p in _PDF_DIR.glob("*.pdf"):
        _PDF_WHITELIST.add(p.name)
        stem = re.sub(r"[\(\)_\-]", " ", p.stem.lower())
        stem = re.sub(r"\s+", " ", stem).strip()
        tokens = frozenset(w for w in stem.split() if len(w) > 2)
        _PDF_TOKENS[tokens] = p.name

_build_pdf_index()


def _find_local_pdf(title: str) -> str | None:
    """Fuzzy-match a Gemini grounding title to a local PDF filename."""
    if not title:
        return None
    # Exact match (case-insensitive)
    lower = title.strip().lower()
    for name in _PDF_WHITELIST:
        if name.lower() == lower or name.lower() == lower + ".pdf":
            return name
    # Token overlap: pick the file with the most matching tokens (min 2)
    title_clean = re.sub(r"[\(\)_\-\.]", " ", lower)
    title_tokens = frozenset(w for w in title_clean.split() if len(w) > 2)
    best_name, best_score = None, 0
    for tokens, fname in _PDF_TOKENS.items():
        score = len(title_tokens & tokens)
        if score > best_score and score >= 2:
            best_score = score
            best_name = fname
    return best_name


@rag_bp.route("/pdf/<path:filename>", methods=["GET"])
def serve_pdf(filename):
    safe_name = secure_filename(filename)
    if safe_name not in _PDF_WHITELIST:
        return jsonify({"error": "not found"}), 404
    return send_from_directory(str(_PDF_DIR), safe_name, mimetype="application/pdf")


# ── Reference extraction ──────────────────────────────────────────────────────

def _extract_references(resp):
    """
    Walk grounding_metadata.grounding_chunks on a Gemini response and return
    a de-duplicated list of reference dicts (max 5).

    Each dict contains:
        title, snippet, uri, is_web,
        kind ("pdf" | "external"),
        pdf_filename (only when kind=="pdf"),
        pdf_url      (only when kind=="pdf")
    """
    refs  = []
    try:
        candidates = getattr(resp, "candidates", None)
        if not candidates:
            return refs

        meta = getattr(candidates[0], "grounding_metadata", None)
        if not meta:
            return refs

        chunks = getattr(meta, "grounding_chunks", None) or []
        log.warning("[refs] grounding_chunks count: %d", len(chunks))
        seen_keys: set = set()

        for chunk in chunks:
            # grounding chunk can carry either retrieved_context (file search)
            # or web (google search) — handle both
            ctx = getattr(chunk, "retrieved_context", None)
            web = getattr(chunk, "web", None)

            if ctx:
                # title may be in 'title' OR 'document_name' depending on the SDK version
                title   = (getattr(ctx, "title",         None) or
                           getattr(ctx, "document_name", None) or "").strip()
                uri     = (getattr(ctx, "uri",  None) or "").strip()
                # snippet may be in 'text' or inside 'rag_chunk.text'
                snippet = (getattr(ctx, "text", None) or "").strip()
                if not snippet:
                    rag_chunk = getattr(ctx, "rag_chunk", None)
                    snippet = (getattr(rag_chunk, "text", None) or "").strip() if rag_chunk else ""
                is_web  = uri.startswith("http") and not title
                log.warning("[refs] ctx chunk — title=%r uri=%r snippet_len=%d", title, uri, len(snippet))
            elif web:
                title   = (getattr(web, "title",  None) or
                           getattr(web, "domain", None) or "").strip()
                uri     = (getattr(web, "uri",    None) or "").strip()
                snippet = ""
                is_web  = True
                log.warning("[refs] web chunk — title=%r uri=%r", title, uri)
            else:
                log.warning("[refs] chunk has neither ctx nor web: %r", chunk)
                continue

            # Use snippet prefix as dedup fallback so chunks without title/uri still appear
            dedup_key = title or uri or snippet[:80]
            if not dedup_key or dedup_key in seen_keys:
                log.warning("[refs] skipping dedup_key=%r", dedup_key)
                continue
            seen_keys.add(dedup_key)

            # Determine kind and map to local PDF if possible
            kind = "external"
            pdf_filename = None
            pdf_url      = None

            if not is_web and title:
                matched = _find_local_pdf(title)
                if matched:
                    kind         = "pdf"
                    pdf_filename = matched
                    pdf_url      = f"/rag/pdf/{matched}"

            refs.append({
                "title":        title or uri,
                "snippet":      snippet[:700] if snippet else "",
                "uri":          uri,
                "is_web":       is_web or kind == "external",
                "kind":         kind,
                "pdf_filename": pdf_filename,
                "pdf_url":      pdf_url,
            })

            if len(refs) >= 5:
                break

    except Exception:
        pass

    return refs


@rag_bp.route("/query", methods=["POST"])
def query():
    data = request.get_json() or {}
    q = (data.get("query") or "").strip()

    if not q:
        return jsonify({"error": "missing 'query' in JSON body"}), 400

    t0 = time.perf_counter()

    try:
        # ── 1. Classify intent ─────────────────────────────────────────────
        decision = route_query(q)
        intent   = decision.intent
        fmt      = decision.format

        # ── 2. Get raw answer based on intent ──────────────────────────────
        references: list = []

        if intent == "small_talk":
            resp   = answer_small_talk(q)
            source = "smalltalk"

        elif intent == "out_of_scope":
            resp   = answer_general(q)
            source = "general"

        else:
            # short_factual and in_scope_detailed both go through RAG
            resp = query_with_fallback(q, fmt=fmt)

            metadata = getattr(
                resp.candidates[0] if hasattr(resp, "candidates") and resp.candidates else resp,
                "grounding_metadata", None
            )
            has_chunks = metadata and getattr(metadata, "grounding_chunks", None)
            source     = "kb" if has_chunks else "search"
            references = _extract_references(resp)

        raw_text = resp.text if hasattr(resp, "text") else str(resp)

        # ── 3. Clean for display and speech ────────────────────────────────
        display_text = clean_for_display(raw_text)
        speech_text  = clean_for_speech(raw_text)

        latency_ms = int((time.perf_counter() - t0) * 1000)

        return jsonify({
            "text":         display_text,   # legacy key
            "display_text": display_text,
            "speech_text":  speech_text,
            "intent":       intent,
            "format":       fmt,
            "source":       source,
            "latency_ms":   latency_ms,
            "references":   references,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
