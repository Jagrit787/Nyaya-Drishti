import os
from google import genai
from google.genai import types

API_KEY = os.environ.get("GOOGLE_API_KEY", "")
API_KEY_2 = os.environ.get("GOOGLE_API_KEY_2", "")
FILE_STORE = os.environ.get("FILE_SEARCH_STORE_NAME", "")

client = genai.Client(api_key=API_KEY)
_client = genai.Client(api_key=API_KEY_2)

_NO_FORMAT = (
    "CRITICAL FORMATTING RULE: Do NOT use asterisks (*), double asterisks (**), hash signs (#), "
    "backticks (`), underscores for emphasis, bullet points, numbered lists, bold, italic, "
    "headings, or ANY markdown or special symbols. Plain prose only. "
    "Violating this rule makes the output unusable for voice output."
)

PERSONA = (
    "You are a warm, knowledgeable assistant helping blind and visually-impaired people in India. "
    "Always speak in plain, conversational prose — like a helpful friend explaining something clearly. "
    "Write in short, clear sentences. Be empathetic and direct. "
    "Keep answers under 180 words. Only include India-specific information when relevant. "
    + _NO_FORMAT
)

SHORT_PERSONA = (
    "You are a concise assistant for blind and visually-impaired people in India. "
    "Reply in ONE clear sentence only. Plain conversational prose only. "
    + _NO_FORMAT
)

GENERAL_PERSONA = (
    "You are a helpful assistant. The user has asked a general question not specifically about "
    "visual impairment. Answer helpfully in plain conversational prose. Keep it under 100 words. "
    + _NO_FORMAT
)


def run_search(query, fmt="detailed"):
    persona = SHORT_PERSONA if fmt == "short" else PERSONA
    final_query = persona + "\n\nQuery: " + query
    return _client.models.generate_content(
        model="gemini-2.5-flash",
        contents=final_query,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )
    )

def answer_general(query):
    """Answer an out-of-scope question using plain LLM (no KB, no search tools)."""
    prompt = GENERAL_PERSONA + "\n\nQuery: " + query
    return _client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

def answer_small_talk(query):
    """Handle greetings and simple social exchanges with a friendly canned-style reply."""
    q = query.strip().lower()
    if any(g in q for g in ("hi", "hello", "hey", "namaste", "namaskar")):
        class _R:
            text = "Hello! I am your legal voice assistant for visually impaired persons in India. Feel free to ask me anything about your rights, government schemes, or assistive resources."
        return _R()
    if any(g in q for g in ("thank", "thanks")):
        class _R:
            text = "You are welcome. I am always here to help you understand your rights and resources."
        return _R()
    if any(g in q for g in ("bye", "goodbye")):
        class _R:
            text = "Goodbye! Take care, and do reach out whenever you need help."
        return _R()
    if any(g in q for g in ("who are you", "what are you", "who r u")):
        class _R:
            text = "I am a voice assistant designed to help blind and visually impaired persons in India understand their legal rights, government schemes, and available resources."
        return _R()
    # Fallback for unmatched small talk
    class _R:
        text = "I am here to help you with any questions about rights and resources for visually impaired persons in India."
    return _R()

def query_with_fallback(query, fmt="detailed"):
    persona = SHORT_PERSONA if fmt == "short" else PERSONA
    contents = persona + "\n\nQuery: " + query

    file_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            tools=[
                types.Tool(
                    file_search=types.FileSearch(
                        file_search_store_names=[FILE_STORE]
                    )
                )
            ]
        )
    )

    # Check grounding
    metadata = getattr(file_response.candidates[0], "grounding_metadata", None)
    has_chunks = metadata and getattr(metadata, "grounding_chunks", None)
    if not has_chunks:
        return run_search(query, fmt=fmt)

    # Fall back to web search if the KB had nothing useful
    if "provided" in file_response.text:
        return run_search(query, fmt=fmt)

    return file_response

