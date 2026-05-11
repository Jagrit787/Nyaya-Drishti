import React, { useContext, useState } from "react";
import "./Sidebar.css";
import { Context } from "../../context/Context";
import { speak } from "../../utils/speak";
import { VM } from "../../utils/voiceMessages";

const FONT_LABELS = { normal: "A", large: "A+", xlarge: "A++" };

const Sidebar = () => {
  const {
    user,
    logout,
    newChat,
    prevPrompts,
    onSent,
    setRecentPrompt,
    fontSize,
    setFontSize,
  } = useContext(Context);

  const [expanded, setExpanded] = useState(true);

  const loadPrompt = (prompt) => {
    setRecentPrompt(prompt);
    onSent(prompt);
  };

  const cycleFontSize = () => {
    setFontSize((prev) => {
      const next = { normal: "large", large: "xlarge", xlarge: "normal" };
      const size = next[prev];
      document.documentElement.style.setProperty(
        "--base-font-size",
        size === "large" ? "18px" : size === "xlarge" ? "21px" : "16px"
      );
      return size;
    });
  };

  return (
    <aside className={`sidebar ${expanded ? "sidebar--expanded" : "sidebar--collapsed"}`}>
      {/* ── Top controls ─────────────────────────────────────────────────── */}
      <div className="sb-top">
        <button
          className="sb-icon-btn sb-toggle"
          onClick={() => setExpanded((p) => !p)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-label="Toggle sidebar"
        >
          {expanded ? "◀" : "▶"}
        </button>

        <button className="sb-new-chat" onClick={() => { speak(VM.newChat()); newChat(); }} title="New conversation">
          <span className="sb-new-icon">＋</span>
          {expanded && <span>New Chat</span>}
        </button>
      </div>

      {/* ── User profile ─────────────────────────────────────────────────── */}
      {expanded && user && (
        <div className="sb-profile">
          <div className="sb-avatar">{user.avatar}</div>
          <div className="sb-user-info">
            <p className="sb-user-name">{user.name}</p>
            <p className="sb-user-role">Registered User</p>
          </div>
        </div>
      )}

      {/* ── Recent history ────────────────────────────────────────────────── */}
      {expanded && prevPrompts.length > 0 && (
        <div className="sb-section">
          <p className="sb-section-label">Recent</p>
          <ul className="sb-history">
            {[...prevPrompts].reverse().slice(0, 8).map((p, i) => (
              <li
                key={i}
                className="sb-history-item"
                onClick={() => loadPrompt(p)}
                title={p}
              >
                <span className="sb-history-icon">💬</span>
                <span className="sb-history-text">{p.slice(0, 24)}{p.length > 24 ? "…" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Spacer */}
      <div className="sb-spacer" />

      {/* ── Bottom actions ────────────────────────────────────────────────── */}
      <div className="sb-bottom">
        {/* Font size toggle */}
        <button
          className="sb-bottom-item"
          onClick={cycleFontSize}
          title="Cycle font size (accessibility)"
        >
          <span className="sb-font-icon">{FONT_LABELS[fontSize]}</span>
          {expanded && <span>Font Size</span>}
        </button>

        <button className="sb-bottom-item" title="Help">
          <span>❓</span>
          {expanded && <span>Help</span>}
        </button>

        <button
          className="sb-bottom-item sb-logout"
          onClick={() => { speak(VM.logout()); setTimeout(logout, 800); }}
          title="Logout"
        >
          <span>🚪</span>
          {expanded && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
