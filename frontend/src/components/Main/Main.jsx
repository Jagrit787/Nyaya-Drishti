import React, { useContext, useEffect, useRef, useState } from "react";
import "./Main.css";
import { Context } from "../../context/Context";
import useVoiceRecorder from "../hooks/useVoiceRecorder";
import VoicePopup from "../VoicePopup.jsx";
import ReferencePanel from "../ReferencePanel.jsx";
import { speak } from "../../utils/speak";
import { VM } from "../../utils/voiceMessages";

// ── Source badge config ──────────────────────────────────────────────────────
const SOURCE_META = {
  kb:        { label: "Knowledge Base", cls: "bubble-badge--kb"        },
  search:    { label: "External",       cls: "bubble-badge--search"    },
  general:   { label: "External",       cls: "bubble-badge--general"   },
  smalltalk: { label: "Quick Reply",    cls: "bubble-badge--smalltalk" },
};

function BubbleBadge({ source }) {
  const m = SOURCE_META[source] ?? SOURCE_META.kb;
  return <span className={`bubble-badge ${m.cls}`}>{m.label}</span>;
}

// ── Feature card prompts ─────────────────────────────────────────────────────
const QUICK_CARDS = [
  {
    icon: "⚖️",
    title: "RPwD Act Rights",
    prompt: "What are my rights under the Rights of Persons with Disabilities Act 2016?",
  },
  {
    icon: "📝",
    title: "Exam Scribe",
    prompt: "How can a blind student get a scribe for CBSE or government exams?",
  },
  {
    icon: "🏛️",
    title: "Government Schemes",
    prompt: "What government schemes and financial assistance exist for visually impaired persons in India?",
  },
  {
    icon: "💼",
    title: "Job Reservations",
    prompt: "What are the job reservations and employment rights for visually impaired people in India?",
  },
  {
    icon: "🎓",
    title: "Education Support",
    prompt: "What education support and concessions are available for blind students in Indian universities?",
  },
  {
    icon: "🚌",
    title: "Travel Benefits",
    prompt: "What travel concessions and transport benefits do visually impaired persons get in India?",
  },
];

// ── Main component ───────────────────────────────────────────────────────────
const Main = () => {
  const {
    user,
    messages,
    addMessage,
    input,
    setInput,
    setRecentPrompt,
    setPrevPrompts,
    loading,
    setLoading,
  } = useContext(Context);

  const [lang, setLang] = useState("en");

  // Voice popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupState,   setPopupState]   = useState("listening");
  const [popupPayload, setPopupPayload] = useState({});

  // Reference panel state
  const [refPanel, setRefPanel] = useState({ open: false, ref: null, query: "" });

  // Track the last user query so bot messages can carry it for highlighting
  const lastUserQueryRef = useRef("");

  const chatBottomRef = useRef(null);

  // ── Welcome cue on first mount ─────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      speak(VM.welcome(user?.name || "friend", lang), { lang });
    }, 400);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Language switch handler ────────────────────────────────────────────
  const handleLangChange = (newLang) => {
    if (newLang === lang) return;
    setLang(newLang);
    if (newLang === "hi") speak(VM.switchedToHindi(), { lang: "hi" });
    else                  speak(VM.switchedToEnglish(), { lang: "en" });
  };

  // ── Auto-scroll to latest message ─────────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Popup state handler ────────────────────────────────────────────────
  const onPopupState = (state, payload = {}) => {
    setPopupState(state);
    setPopupPayload(payload || {});
    if (["listening","transcribing","thinking","speaking","finished","no_speech","error"].includes(state)) {
      setPopupVisible(true);
    }
  };

  // ── onFinalText from recorder ──────────────────────────────────────────
  const onFinalText = (userText, ragAnswer, meta = {}) => {
    if (userText) {
      setInput(userText);
      setRecentPrompt(userText);
      setPrevPrompts((p) => [...p, userText]);
      addMessage("user", userText);
      lastUserQueryRef.current = userText;
    }
    if (ragAnswer) {
      addMessage("bot", ragAnswer, { ...meta, userQuery: lastUserQueryRef.current });
    }
  };

  const recorder = useVoiceRecorder({ lang, onFinalText, onPopupState });

  // ── Mic button ────────────────────────────────────────────────────────
  const handleMicClick = () => {
    if (!recorder.recording) {
      setPopupVisible(true);
      recorder.startRecording();
    } else {
      recorder.stopRecording();
    }
  };

  // ── Typed send ────────────────────────────────────────────────────────
  const handleSend = () => {
    const q = input.trim();
    if (!q) return;
    addMessage("user", q);
    setRecentPrompt(q);
    setPrevPrompts((p) => [...p, q]);
    lastUserQueryRef.current = q;
    setInput("");
    setLoading(true);
    recorder.sendToRAG(q).finally(() => setLoading(false));
  };

  // ── Feature card click ────────────────────────────────────────────────
  const handleCardClick = (card) => {
    speak(VM.cardSelected(card.title, lang), { lang });
    addMessage("user", card.prompt);
    setRecentPrompt(card.prompt);
    setPrevPrompts((p) => [...p, card.prompt]);
    lastUserQueryRef.current = card.prompt;
    setLoading(true);
    recorder.sendToRAG(card.prompt).finally(() => setLoading(false));
  };

  // ── Reference panel ───────────────────────────────────────────────────
  const openRefPanel = (ref, query) => setRefPanel({ open: true, ref, query });
  const closeRefPanel = () => setRefPanel({ open: false, ref: null, query: "" });

  const hasMessages = messages.length > 0;

  return (
    <div className="main">
      {/* Voice popup */}
      <VoicePopup
        visible={popupVisible}
        state={popupState}
        payload={popupPayload}
        onStopRecording={recorder.stopRecording}
        onClose={() => { setPopupVisible(false); setPopupState("idle"); setPopupPayload({}); }}
      />

      {/* Reference panel */}
      {refPanel.open && (
        <ReferencePanel
          reference={refPanel.ref}
          query={refPanel.query}
          lang={lang}
          onClose={closeRefPanel}
        />
      )}

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="main-nav">
        <div className="main-nav-brand">
          <span className="main-nav-logo">👁️</span>
          <span className="main-nav-title">Nyay Drishti</span>
        </div>

        <div className="main-nav-right">
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === "en" ? "lang-btn--active" : ""}`} onClick={() => handleLangChange("en")}>EN</button>
            <button className={`lang-btn ${lang === "hi" ? "lang-btn--active" : ""}`} onClick={() => handleLangChange("hi")}>HI</button>
          </div>

          <div className="main-user-chip">
            <div className="main-user-avatar">{user?.avatar ?? "?"}</div>
            <span className="main-user-name">{user?.name?.split(" ")[0]}</span>
          </div>
        </div>
      </nav>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="main-content">
        {!hasMessages ? (
          /* Hero + feature cards */
          <div className="hero">
            <div className="hero-glow" />
            <h1 className="hero-greeting">
              Hello, <span className="hero-name">{user?.name?.split(" ")[0]}</span> 👋
            </h1>
            <p className="hero-sub">
              Ask me anything about your rights, government schemes, or resources
              for visually-impaired persons in India.
            </p>

            <div className="cards-grid">
              {QUICK_CARDS.map((c) => (
                <button
                  key={c.title}
                  className="feature-card"
                  onClick={() => handleCardClick(c)}
                >
                  <span className="feature-card-icon">{c.icon}</span>
                  <p className="feature-card-title">{c.title}</p>
                  <p className="feature-card-hint">{c.prompt.slice(0, 55)}…</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Chat bubbles */
          <div className="chat-area">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`bubble-row ${msg.role === "user" ? "bubble-row--user" : "bubble-row--bot"}`}
              >
                {msg.role === "bot" && (
                  <div className="bubble-avatar bubble-avatar--bot">👁️</div>
                )}

                <div className={`bubble ${msg.role === "user" ? "bubble--user" : "bubble--bot"}`}>
                  <p className="bubble-text">{msg.text}</p>

                  {msg.role === "bot" && (
                    <div className="bubble-footer">
                      {/* Source badge + latency */}
                      {msg.source && (
                        <div className="bubble-meta">
                          <BubbleBadge source={msg.source} />
                          {msg.latencyMs && (
                            <span className="bubble-latency">{(msg.latencyMs / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      )}

                      {/* References chips */}
                      {msg.references?.length > 0 && (
                        <div className="bubble-refs">
                          <span className="bubble-refs-label">Sources</span>
                          <div className="bubble-refs-chips">
                            {msg.references.map((ref, i) => (
                              <button
                                key={i}
                                className="bubble-ref-chip"
                                onClick={() => openRefPanel(ref, msg.userQuery || msg.text)}
                                title={ref.title}
                              >
                                {ref.is_web ? "🌐" : "📄"}&nbsp;
                                {ref.title
                                  ? ref.title.length > 30
                                    ? ref.title.slice(0, 30) + "…"
                                    : ref.title
                                  : `Source ${i + 1}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="bubble-avatar bubble-avatar--user">
                    {user?.avatar ?? "?"}
                  </div>
                )}
              </div>
            ))}

            {/* Loading bubble */}
            {loading && (
              <div className="bubble-row bubble-row--bot">
                <div className="bubble-avatar bubble-avatar--bot">👁️</div>
                <div className="bubble bubble--bot bubble--loading">
                  <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────── */}
      <div className="input-bar-wrapper">
        <div className="input-bar">
          <input
            className="input-bar-field"
            type="text"
            placeholder="Ask about your rights, schemes, resources…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) handleSend(); }}
          />

          <div className="input-bar-actions">
            <button
              className={`ib-btn ib-btn--mic ${recorder.recording ? "ib-btn--recording" : ""}`}
              onClick={handleMicClick}
              title={recorder.recording ? "Stop recording" : "Record voice"}
              aria-label="Microphone"
            >
              🎙️
            </button>

            <button
              className="ib-btn ib-btn--send"
              onClick={handleSend}
              disabled={!input.trim()}
              title="Send"
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
        <p className="input-bar-hint">
          Powered by Gemini · Answers grounded in Indian law &amp; policy
        </p>
      </div>
    </div>
  );
};

export default Main;
