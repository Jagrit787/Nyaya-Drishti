import React, { useEffect, useRef, useState } from "react";
import "./VoicePopup.css";

// ── Source badge config ──────────────────────────────────────────────────────
const SOURCE_BADGE = {
  kb: { label: "Knowledge Base", className: "vp-badge--kb" },
  search: { label: "Web Search", className: "vp-badge--search" },
  general: { label: "General Answer — not from knowledge base", className: "vp-badge--general" },
  smalltalk: { label: "Quick Reply", className: "vp-badge--smalltalk" },
};

function SourceBadge({ source }) {
  const cfg = SOURCE_BADGE[source] ?? SOURCE_BADGE.kb;
  return <span className={`vp-badge ${cfg.className}`}>{cfg.label}</span>;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function VoicePopup({
  visible,
  state,
  payload,
  onStopRecording,
  onClose,
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const audioRef = useRef(null);

  const words = payload?.ragAnswer ? payload.ragAnswer.split(" ") : [];
  const [wordIndex, setWordIndex] = useState(0);

  const source = payload?.source ?? "kb";
  const isShort = payload?.fmt === "short";
  const latencyMs = payload?.latencyMs ?? null;

  // Reset when new audio arrives
  useEffect(() => {
    setPlaying(false);
    setWordIndex(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [payload?.audioUrl]);

  // Word-highlight progress
  useEffect(() => {
    let timer = null;
    if (playing && audioRef.current && words.length > 1) {
      timer = setInterval(() => {
        const dur = audioRef.current.duration || 1;
        const cur = audioRef.current.currentTime;
        const idx = Math.floor((cur / dur) * words.length);
        setWordIndex(Math.min(idx, words.length - 1));
      }, 120);
    }
    return () => clearInterval(timer);
  }, [playing, words.length]);

  const play = () => {
    if (!payload?.audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(payload.audioUrl);
      audioRef.current.playbackRate = speed;
      audioRef.current.onended = () => setPlaying(false);
    }
    audioRef.current.play();
    setPlaying(true);
  };

  const pause = () => {
    if (audioRef.current) audioRef.current.pause();
    setPlaying(false);
  };

  const replay = () => {
    if (!payload?.audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(payload.audioUrl);
    }
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.playbackRate = speed;
    audioRef.current.play();
    setPlaying(true);
    setWordIndex(0);
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  if (!visible) return null;

  return (
    <div className="vp-overlay">
      <div className="vp-modal">

        {/* HEADER */}
        <div className="vp-header">
          <div className="vp-title">Voice assistant</div>
          <button className="vp-close" onClick={onClose}>✕</button>
        </div>

        {/* BODY */}
        <div className="vp-body">

          {state === "listening" && (
            <div className="vp-center">
              <div className="vp-mic-pulse" />
              <div className="vp-msg">Listening…</div>
              <div className="vp-sub">Speak now — press Stop when done.</div>
            </div>
          )}

          {state === "transcribing" && (
            <div className="vp-loading-wrapper">
              <div className="vp-spinner" />
              <div className="vp-msg">Transcribing your voice…</div>
              <div className="vp-sub">{payload?.sttText ?? "Uploading audio..."}</div>
            </div>
          )}

          {state === "thinking" && (
            <div className="vp-loading-wrapper">
              <div className="vp-spinner" />
              <div className="vp-msg">Understanding your query…</div>
              <div className="vp-sub">{payload?.sttText ?? ""}</div>
            </div>
          )}

          {state === "speaking" && (
            <div className="vp-loading-wrapper">
              <div className="vp-spinner" />
              <div className="vp-msg">Generating audio response…</div>
              <div className="vp-sub">{payload?.ragAnswer ?? ""}</div>
            </div>
          )}

          {state === "finished" && (
            <>
              {/* Source badge */}
              <div className="vp-badge-row">
                <SourceBadge source={source} />
              </div>

              {isShort ? (
                /* Compact single-line view for short / factual answers */
                <div className="vp-quick-answer">
                  {payload?.ragAnswer ?? ""}
                </div>
              ) : (
                /* Scrollable word-highlight view for detailed answers */
                <div className="vp-answer-box">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      className={i === wordIndex ? "highlight-word" : ""}
                    >
                      {w}&nbsp;
                    </span>
                  ))}
                </div>
              )}

              {/* PLAYER */}
              <div className="vp-player">
                <button className="vp-btn" onClick={playing ? pause : play}>
                  {playing ? "Pause" : "Play"}
                </button>
                <button className="vp-btn" onClick={replay}>Replay</button>
                <div className="vp-speed">
                  <label>Speed</label>
                  <select
                    value={speed}
                    onChange={(e) => changeSpeed(Number(e.target.value))}
                  >
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>
              </div>

              {/* Latency footer */}
              {latencyMs !== null && (
                <div className="vp-latency">Answered in {(latencyMs / 1000).toFixed(1)}s</div>
              )}
            </>
          )}

          {state === "no_speech" && (
            <div className="vp-center">
              <div className="vp-no-speech-icon">🔇</div>
              <div className="vp-msg" style={{ color: "#fbbf24" }}>No speech detected</div>
              <div className="vp-sub">
                We could not hear anything. Please press the mic button and speak clearly into your device.
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="vp-center">
              <div className="vp-msg">Something went wrong</div>
              <div className="vp-sub">{payload?.error ?? "Try again."}</div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="vp-footer">
          {state === "listening" ? (
            <button className="vp-stop" onClick={onStopRecording}>Stop</button>
          ) : (
            <button className="vp-done" onClick={onClose}>Done</button>
          )}
        </div>

      </div>
    </div>
  );
}
