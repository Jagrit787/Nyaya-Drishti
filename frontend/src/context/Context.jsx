import { createContext, useState } from "react";

export const Context = createContext();

const ContextProvider = ({ children }) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null); // { name, avatar }

  // ── Chat messages (conversation bubbles) ─────────────────────────────────
  // Each message: { id, role: 'user'|'bot', text, source, intent, latencyMs, ts }
  const [messages, setMessages] = useState([]);

  const addMessage = (role, text, meta = {}) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role,
        text,
        source:     meta.source     ?? null,
        intent:     meta.intent     ?? null,
        fmt:        meta.fmt        ?? null,
        latencyMs:  meta.latencyMs  ?? null,
        references: meta.references ?? [],
        userQuery:  meta.userQuery  ?? null,
        ts: new Date(),
      },
    ]);
  };

  // ── Legacy input state (kept for backward compat with useVoiceRecorder) ──
  const [prevPrompts, setPrevPrompts] = useState([]);
  const [input, setInput] = useState("");
  const [recentPrompt, setRecentPrompt] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState("");

  // ── Font size preference ──────────────────────────────────────────────────
  const [fontSize, setFontSize] = useState("normal"); // normal | large | xlarge

  const onSent = async (prompt) => {
    if (!prompt || !prompt.trim()) return;
    setLoading(true);
    setShowResult(true);
    setResultData("");
    setRecentPrompt(prompt);
    setPrevPrompts((prev) => [...prev, prompt]);
    setInput("");
    setLoading(false);
  };

  const newChat = () => {
    setInput("");
    setRecentPrompt("");
    setResultData("");
    setShowResult(false);
    setLoading(false);
    setMessages([]);
  };

  const logout = () => {
    setUser(null);
    newChat();
    setPrevPrompts([]);
  };

  const contextValue = {
    // auth
    user,
    setUser,
    logout,

    // messages / conversation
    messages,
    setMessages,
    addMessage,

    // font size
    fontSize,
    setFontSize,

    // legacy
    prevPrompts,
    setPrevPrompts,
    input,
    setInput,
    recentPrompt,
    setRecentPrompt,
    resultData,
    setResultData,
    showResult,
    setShowResult,
    loading,
    setLoading,
    onSent,
    newChat,
  };

  return (
    <Context.Provider value={contextValue}>
      {children}
    </Context.Provider>
  );
};

export default ContextProvider;
