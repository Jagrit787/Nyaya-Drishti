/**
 * voiceMessages.js
 * Central store for all spoken navigation cues.
 * Every function accepts a `lang` parameter ("en" | "hi") so the app
 * can speak in whichever language the user has selected.
 */

export const VM = {
  // ── Auth ────────────────────────────────────────────────────────────────
  welcome: (name, lang = "en") =>
    lang === "hi"
      ? `Namaste ${name}. Main Nyay Drishti hoon, aapka kanuni voice assistant. ` +
        `Aap mujhse apne adhikaron, sarkari yojanaon, ya uphalbdh sahayata ke baare mein pooch sakte hain. ` +
        `Sawaal poochne ke liye microphone button dabaayein.`
      : `Welcome, ${name}. I am Nyay Drishti, your legal voice assistant for visually impaired persons in India. ` +
        `You can ask me about your rights, government schemes, or available resources. ` +
        `Press the microphone button to speak, or type your question below.`,

  // ── Language switch ──────────────────────────────────────────────────────
  switchedToHindi: () =>
    "Hindi mein switch kar diya gaya hai. Ab aap Hindi mein sawal pooch sakte hain.",

  switchedToEnglish: () =>
    "Switched to English. You can now ask your questions in English.",

  // ── Recording lifecycle ──────────────────────────────────────────────────
  listening: (lang = "en") =>
    lang === "hi"
      ? "Sun raha hoon. Kripya apna sawal spasht bolein."
      : "Listening. Please speak your question clearly.",

  thinking: (lang = "en") =>
    lang === "hi"
      ? "Theek hai. Aapka jawab dhundh raha hoon."
      : "Got it. Finding the answer for you.",

  answerReady: (lang = "en") =>
    lang === "hi"
      ? "Yeh raha aapka jawab."
      : "Here is your answer.",

  // ── Error / no-speech ───────────────────────────────────────────────────
  noSpeech: (lang = "en") =>
    lang === "hi"
      ? "Maafi karein, mujhe koi awaaz nahi mili. Kripya dobara microphone button dabaayein aur bolein."
      : "Sorry, I could not detect any speech. Please press the microphone button and try again.",

  error: (lang = "en") =>
    lang === "hi"
      ? "Kuch galat ho gaya. Kripya dobara try karein."
      : "Something went wrong. Please try again.",

  ttsError: (lang = "en") =>
    lang === "hi"
      ? "Aapka jawab screen par taiyar hai. Abhi audio nahi chal sakti."
      : "Your answer is ready on screen. Audio playback is currently unavailable.",

  // ── Navigation ──────────────────────────────────────────────────────────
  newChat: (lang = "en") =>
    lang === "hi"
      ? "Nayi baatcheet shuru ho rahi hai."
      : "Starting a new conversation.",

  cardSelected: (title, lang = "en") =>
    lang === "hi"
      ? `${title} ke baare mein dhundh raha hoon. Kripya prateeksha karein.`
      : `Searching for: ${title}. Please wait.`,

  refOpened: (docTitle, lang = "en") =>
    lang === "hi"
      ? `${docTitle} document khul raha hai.`
      : `Opening source document: ${docTitle}.`,

  logout: (lang = "en") =>
    lang === "hi"
      ? "Aap logout ho gaye. Alvida."
      : "You have been logged out. Goodbye.",
};
