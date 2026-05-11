import React, { useContext, useEffect, useRef, useState } from "react";
import "./Login.css";
import { Context } from "../../context/Context";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const SAMPLE_USERS = [
  { name: "Arjun Sharma", pin: "1234" },
  { name: "Priya Verma", pin: "0000" },
  { name: "Ravi Kumar", pin: "5678" },
];

export default function Login() {
  const { setUser } = useContext(Context);

  const [mode, setMode] = useState("idle"); // idle | listening | detected | error | text
  const [detectedName, setDetectedName] = useState("");
  const [textName, setTextName] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [voiceSupported] = useState(() => !!SpeechRecognition);

  const recognitionRef = useRef(null);
  const autoLoginRef = useRef(null);

  const startVoiceLogin = () => {
    if (!voiceSupported) {
      setMode("text");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setMode("listening");

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim();
      // Strip common prefixes people say
      const cleaned = transcript
        .replace(/^(my name is|i am|i'm|login as|this is)\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      setDetectedName(name);
      setMode("detected");
      autoLoginRef.current = setTimeout(() => doLogin(name), 1800);
    };

    recognition.onerror = (e) => {
      setErrMsg(
        e.error === "not-allowed"
          ? "Microphone access was denied. Please allow mic access or use the text login below."
          : "Could not understand. Please try again or type your name."
      );
      setMode("error");
    };

    recognition.onend = () => {
      if (mode === "listening") setMode("idle");
    };

    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setMode("idle");
  };

  const doLogin = (name) => {
    clearTimeout(autoLoginRef.current);
    const n = (name || detectedName || textName).trim();
    if (!n) return;
    setUser({ name: n, avatar: n.charAt(0).toUpperCase() });
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textName.trim()) doLogin(textName.trim());
  };

  useEffect(() => () => {
    recognitionRef.current?.stop();
    clearTimeout(autoLoginRef.current);
  }, []);

  return (
    <div className="login-page">
      {/* Ambient glows */}
      <div className="login-glow login-glow--1" />
      <div className="login-glow login-glow--2" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-icon">👁️</span>
          <span className="login-logo-dot" />
        </div>

        <h1 className="login-title">
          <span className="login-title-gradient">Nyay Drishti</span>
        </h1>
        <p className="login-subtitle">
          Legal Voice Assistant for Visually-Impaired Persons in India
        </p>

        <div className="login-divider" />

        {/* Voice login section */}
        {mode === "idle" && (
          <>
            {voiceSupported ? (
              <button className="login-voice-btn" onClick={startVoiceLogin}>
                <span className="login-voice-icon">🎙️</span>
                Login with Voice
              </button>
            ) : null}

            <button
              className="login-text-btn"
              onClick={() => setMode("text")}
            >
              ✏️ &nbsp;Enter name instead
            </button>

            {voiceSupported && (
              <p className="login-hint">
                Say your name — for example: &ldquo;Arjun Sharma&rdquo;
              </p>
            )}
          </>
        )}

        {mode === "listening" && (
          <div className="login-listening">
            <div className="login-pulse">
              <div className="login-pulse-ring" />
              <div className="login-pulse-ring login-pulse-ring--2" />
              <span className="login-pulse-icon">🎙️</span>
            </div>
            <p className="login-listening-text">Listening…</p>
            <p className="login-hint">Speak your name clearly</p>
            <button className="login-cancel-btn" onClick={stopListening}>
              Cancel
            </button>
          </div>
        )}

        {mode === "detected" && (
          <div className="login-detected">
            <div className="login-avatar">{detectedName.charAt(0)}</div>
            <p className="login-detected-name">Hello, {detectedName}!</p>
            <p className="login-hint">Logging you in…</p>
            <button
              className="login-confirm-btn"
              onClick={() => doLogin(detectedName)}
            >
              Confirm &amp; Enter
            </button>
            <button
              className="login-cancel-btn"
              onClick={() => {
                clearTimeout(autoLoginRef.current);
                setMode("idle");
              }}
            >
              Not me
            </button>
          </div>
        )}

        {mode === "error" && (
          <div className="login-error-box">
            <p className="login-error-msg">{errMsg}</p>
            <button
              className="login-voice-btn"
              onClick={() => setMode("idle")}
              style={{ marginTop: "14px" }}
            >
              Try Again
            </button>
          </div>
        )}

        {mode === "text" && (
          <form className="login-text-form" onSubmit={handleTextSubmit}>
            <input
              className="login-text-input"
              type="text"
              placeholder="Enter your name…"
              value={textName}
              onChange={(e) => setTextName(e.target.value)}
              autoFocus
            />
            <button
              className="login-confirm-btn"
              type="submit"
              disabled={!textName.trim()}
            >
              Enter App →
            </button>
            {voiceSupported && (
              <button
                type="button"
                className="login-cancel-btn"
                onClick={() => setMode("idle")}
              >
                ← Use voice instead
              </button>
            )}
          </form>
        )}

        {/* Sample user hints */}
        {(mode === "idle" || mode === "text") && (
          <div className="login-samples">
            <p className="login-samples-label">Quick demo — click to login as:</p>
            <div className="login-samples-row">
              {SAMPLE_USERS.map((u) => (
                <button
                  key={u.name}
                  className="login-sample-chip"
                  onClick={() => doLogin(u.name)}
                >
                  {u.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="login-footer">
        Built for accessibility · BTP 2025–26
      </p>
    </div>
  );
}
