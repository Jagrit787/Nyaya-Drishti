import os
import json
import re
from google import genai
from google.genai import types

API_KEY = os.environ.get("GOOGLE_API_KEY_2", "")
_client = genai.Client(api_key=API_KEY)

# ── Greeting / small-talk shortcut (no LLM cost) ──────────────────────────────
_GREETING_RE = re.compile(
    r"^\s*(hi|hello|hey|good\s*(morning|afternoon|evening|night)|"
    r"namaste|namaskar|thank\s*you|thanks|thank\s*u|bye|goodbye|"
    r"who\s*are\s*you|what\s*are\s*you|who\s*r\s*u)\W*$",
    re.IGNORECASE,
)

# ── Classifier prompt ──────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are an intent classifier for a voice assistant that helps blind and visually-impaired persons in India.

Classify the user query into EXACTLY ONE of these three intents and respond with valid JSON only:

1. "out_of_scope"   – The question has nothing to do with blindness, visual impairment, disability rights, assistive technology, government schemes for PwD, or related welfare topics in India. Examples: capital of France, cricket score, recipe for biryani.

2. "short_factual"  – The query IS about blind/disability/rights topics BUT the ideal answer is a single sentence or phrase. Examples: "What is the RPwD Act?", "What does NHFDC stand for?", "What year was NAB founded?", "Is Braille allowed in UPSC?"

3. "in_scope_detailed" – The query IS about blind/disability/rights topics AND requires a multi-sentence explanation. Examples: "How can a blind student get a scribe in CBSE exams?", "What are the job reservations for visually impaired in India?", "Explain the rights under the RPwD Act 2016."

Respond with JSON only, no extra text:
{"intent": "<intent_string>", "format": "<short|detailed>"}

Rules:
- out_of_scope → format: "short"
- short_factual → format: "short"
- in_scope_detailed → format: "detailed"
- When in doubt, prefer "in_scope_detailed".
"""

_FEW_SHOTS = [
    {"role": "user", "parts": [{"text": "What is the capital of France?"}]},
    {"role": "model", "parts": [{"text": '{"intent": "out_of_scope", "format": "short"}'}]},
    {"role": "user", "parts": [{"text": "What is the RPwD Act?"}]},
    {"role": "model", "parts": [{"text": '{"intent": "short_factual", "format": "short"}'}]},
    {"role": "user", "parts": [{"text": "How can a blind student get a scribe in CBSE?"}]},
    {"role": "model", "parts": [{"text": '{"intent": "in_scope_detailed", "format": "detailed"}'}]},
    {"role": "user", "parts": [{"text": "What year was the National Association for the Blind founded?"}]},
    {"role": "model", "parts": [{"text": '{"intent": "short_factual", "format": "short"}'}]},
    {"role": "user", "parts": [{"text": "Show me a chicken curry recipe"}]},
    {"role": "model", "parts": [{"text": '{"intent": "out_of_scope", "format": "short"}'}]},
]


class IntentDecision:
    __slots__ = ("intent", "format")

    def __init__(self, intent: str, fmt: str):
        self.intent = intent
        self.format = fmt

    def __repr__(self):
        return f"IntentDecision(intent={self.intent!r}, format={self.format!r})"


_DEFAULT = IntentDecision("in_scope_detailed", "detailed")


def route_query(query: str) -> IntentDecision:
    """
    Classify the query intent without any blocking.
    Falls back to in_scope_detailed on any failure.
    """
    query = query.strip()
    if not query:
        return _DEFAULT

    # Fast path: greeting / small-talk
    if _GREETING_RE.match(query):
        return IntentDecision("small_talk", "short")

    try:
        contents = [
            *[
                types.Content(role=t["role"], parts=[types.Part(text=t["parts"][0]["text"])])
                for t in _FEW_SHOTS
            ],
            types.Content(role="user", parts=[types.Part(text=query)]),
        ]

        response = _client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                temperature=0.0,
                max_output_tokens=64,
            ),
        )

        raw = response.text.strip()
        # Extract JSON even if model wraps it in ```json
        match = re.search(r'\{[^}]+\}', raw)
        if not match:
            return _DEFAULT

        data = json.loads(match.group())
        intent = data.get("intent", "in_scope_detailed")
        fmt = data.get("format", "detailed")

        if intent not in ("out_of_scope", "short_factual", "in_scope_detailed", "small_talk"):
            intent = "in_scope_detailed"
        if fmt not in ("short", "detailed"):
            fmt = "detailed" if intent == "in_scope_detailed" else "short"

        return IntentDecision(intent, fmt)

    except Exception:
        return _DEFAULT
