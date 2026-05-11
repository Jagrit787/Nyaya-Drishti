/**
 * speak.js
 * Thin wrapper around the browser's native Web Speech API (SpeechSynthesis).
 * Used for navigation voice cues — no API cost, instant, works offline.
 *
 * Language priority:
 *   Hindi  → hi-IN  (then any hi-*)
 *   English → en-IN → en-GB → en-US → any en-*
 */

let _voiceCacheEn = null;
let _voiceCacheHi = null;

function _pickVoice(lang = "en") {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (lang === "hi") {
    const hi = voices.find((v) => v.lang === "hi-IN")
            || voices.find((v) => v.lang.startsWith("hi"));
    if (hi) return hi;
    // Fall back to English if no Hindi voice is available
  }

  // English preference chain
  const EN_PREFERRED = ["en-IN", "en-GB", "en-US"];
  for (const l of EN_PREFERRED) {
    const match = voices.find((v) => v.lang === l);
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en")) || null;
}

function _getVoice(lang = "en") {
  if (lang === "hi") {
    if (!_voiceCacheHi) _voiceCacheHi = _pickVoice("hi");
    return _voiceCacheHi;
  }
  if (!_voiceCacheEn) _voiceCacheEn = _pickVoice("en");
  return _voiceCacheEn;
}

// Chrome loads voices asynchronously — warm the cache on the voices-changed event
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    _voiceCacheEn = _pickVoice("en");
    _voiceCacheHi = _pickVoice("hi");
  };
}

/**
 * Speak text aloud using browser synthesis.
 * Cancels any currently playing utterance first.
 *
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, volume?: number, lang?: "en"|"hi" }} opts
 */
export function speak(text, { rate = 0.92, pitch = 1.0, volume = 1.0, lang = "en" } = {}) {
  if (!text || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate   = rate;
  utter.pitch  = pitch;
  utter.volume = volume;

  const voice = _getVoice(lang);
  if (voice) {
    utter.voice = voice;
    utter.lang  = voice.lang;
  } else {
    utter.lang = lang === "hi" ? "hi-IN" : "en-IN";
  }

  window.speechSynthesis.speak(utter);
}

/** Immediately stop any ongoing speech. */
export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
