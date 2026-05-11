// src/components/hooks/useVoiceRecorder.jsx
import { useRef, useState } from "react";
import { speak } from "../../utils/speak";
import { VM } from "../../utils/voiceMessages";

/**
 * useVoiceRecorder
 *
 * onFinalText(userText|null, ragAnswer|null, meta|{})
 * onPopupState(stateString, payloadObject)
 *
 * states: "listening" | "transcribing" | "thinking" | "speaking"
 *       | "finished" | "no_speech" | "error" | "idle"
 */
export default function useVoiceRecorder({ lang = "en", onFinalText, onPopupState }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus]       = useState("idle");

  const mediaRecorderRef = useRef(null);
  const streamRef        = useRef(null);
  const chunksRef        = useRef([]);
  const timeoutRef       = useRef(null);

  const MAX_MS          = 12000;
  const MIN_BLOB_BYTES  = 800;   // blobs smaller than this contain no real audio
  const backendBaseRaw  = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000/";
  const backendBase     = backendBaseRaw.endsWith("/") ? backendBaseRaw : `${backendBaseRaw}/`;
  const STT_API_URL     = `${backendBase}audio/stt`;
  const RAG_API_URL     = `${backendBase}rag/query`;
  const TTS_API_URL     = `${backendBase}audio/tts`;

  // ── Safe callers ──────────────────────────────────────────────────────────
  const safePopup = (state, payload = {}) => {
    try { onPopupState?.(state, payload); }
    catch (e) { console.error("[recorder] onPopupState threw:", e); }
  };

  const safeFinalText = (userText, ragAnswer, meta = {}) => {
    try { onFinalText?.(userText, ragAnswer, meta); }
    catch (e) { console.error("[recorder] onFinalText threw:", e); }
  };

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      setStatus("requesting");
      safePopup("listening", {});

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.onstart = () => {
        setRecording(true);
        setStatus("listening");
        safePopup("listening", {});
      };

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        setRecording(false);
        setStatus("processing");
        safePopup("transcribing", { sttText: "" });

        try {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        } catch (err) {
          console.warn("[recorder] error stopping tracks:", err);
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        // ── Frontend blob-size guard ──────────────────────────────────────
        if (blob.size < MIN_BLOB_BYTES) {
          speak(VM.noSpeech(lang), { lang });
          safePopup("no_speech", {});
          setStatus("idle");
          return;
        }

        await uploadToSTT(blob);
      };

      mr.onerror = (ev) => {
        console.error("[recorder] mediaRecorder error:", ev);
        speak(VM.error(lang), { lang });
        setStatus("error");
        safePopup("error", { error: String(ev) });
      };

      // Announce "Listening" BEFORE opening the mic so the mic doesn't pick up the cue
      speak(VM.listening(lang), { lang });
      await new Promise((r) => setTimeout(r, 550));

      mr.start();

      // Safety timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        try {
          if (mediaRecorderRef.current?.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        } catch (e) {
          console.warn("[recorder] timeout stop error", e);
        }
      }, MAX_MS);

    } catch (err) {
      console.error("[recorder] startRecording failed:", err);
      speak(VM.error(lang), { lang });
      setStatus("error");
      safePopup("error", { error: String(err) });
    }
  };

  // ── Stop recording ────────────────────────────────────────────────────────
  const stopRecording = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (err) {
      console.error("[recorder] stopRecording error:", err);
      speak(VM.error(lang), { lang });
      safePopup("error", { error: String(err) });
    }
  };

  // ── Upload to STT ─────────────────────────────────────────────────────────
  const uploadToSTT = async (blob) => {
    safePopup("transcribing", { sttText: "Uploading audio…" });
    setStatus("transcribing");

    try {
      const file = new File([blob], "audio.webm", { type: "audio/webm" });
      const fd   = new FormData();
      fd.append("audio", file);

      const res = await fetch(STT_API_URL, { method: "POST", body: fd });

      // Non-2xx from STT → treat as no-speech, not a hard error
      if (!res.ok) {
        speak(VM.noSpeech(lang), { lang });
        safePopup("no_speech", {});
        setStatus("idle");
        return;
      }

      const j = await res.json();

      // ── No-speech guard ────────────────────────────────────────────────
      if (j.no_speech || !(j.translated_text || "").trim()) {
        speak(VM.noSpeech(lang), { lang });
        safePopup("no_speech", {});
        setStatus("idle");
        return;
      }

      const sttText = j.translated_text.trim();
      safeFinalText(sttText, null);
      safePopup("thinking", { sttText });
      speak(VM.thinking(lang), { lang });

      await sendToRAG(sttText);

    } catch (err) {
      console.error("[recorder] uploadToSTT error:", err);
      speak(VM.error(lang), { lang });
      setStatus("error");
      safePopup("error", { error: String(err) });
    }
  };

  // ── Send text to RAG then TTS (exposed publicly for typed input) ──────────
  const sendToRAG = async (text) => {
    safePopup("thinking", { sttText: text });
    setStatus("thinking");

    try {
      const res = await fetch(RAG_API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: text }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("RAG failed: " + res.status + " " + txt);
      }

      const data = await res.json();

      const displayText = data.display_text ?? data.text ?? JSON.stringify(data);
      const speechText  = data.speech_text  ?? displayText;
      const source      = data.source       ?? "kb";
      const intent      = data.intent       ?? "in_scope_detailed";
      const fmt         = data.format       ?? "detailed";
      const latencyMs   = data.latency_ms   ?? null;
      const references  = data.references   ?? [];

      safeFinalText(text, displayText, { source, intent, fmt, latencyMs, references });

      safePopup("speaking", { sttText: text, ragAnswer: displayText });
      setStatus("speaking");

      const audioUrl = await fetchTTSAndCreateURL(speechText);

      if (!audioUrl) {
        speak(VM.ttsError(lang), { lang });
        safePopup("finished", { sttText: text, ragAnswer: displayText, audioUrl: null, source, intent, fmt, latencyMs });
        setStatus("done");
        return { ragAnswer: displayText, audioUrl: null };
      }

      safePopup("finished", { sttText: text, ragAnswer: displayText, audioUrl, source, intent, fmt, latencyMs });
      setStatus("done");
      return { ragAnswer: displayText, audioUrl };

    } catch (err) {
      console.error("[recorder] sendToRAG error:", err);
      speak(VM.error(lang), { lang });
      safePopup("error", { error: String(err) });
      setStatus("error");
      return null;
    }
  };

  // ── Fetch TTS audio ───────────────────────────────────────────────────────
  const fetchTTSAndCreateURL = async (text) => {
    try {
      const res = await fetch(TTS_API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, lang }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("TTS failed: " + res.status + " " + txt);
      }
      const buf  = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("[recorder] fetchTTS error:", err);
      return null;
    }
  };

  return { startRecording, stopRecording, sendToRAG, recording, status };
}
