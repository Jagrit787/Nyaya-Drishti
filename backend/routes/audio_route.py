import re
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file
from services.text_and_speech import speech_to_text, text_to_speech

audio_bp = Blueprint("audio", __name__)

# Minimum blob size that can hold real speech data (webm header alone is ~50 bytes)
_MIN_AUDIO_BYTES = 800

# Markers Gemini returns when no speech is present
_NO_SPEECH_RE = re.compile(
    r"^\s*(no[_\s]speech[_\s]detected|no\s+speech|error|silence\s*detected|"
    r"no\s*audio|unintelligible|inaudible|i\s+cannot\s+transcribe)\s*[.!]?\s*$",
    re.IGNORECASE,
)


def _is_no_speech(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped or len(stripped) < 3:
        return True
    if _NO_SPEECH_RE.match(stripped):
        return True
    return False


@audio_bp.route("/stt", methods=["POST"])
def translate_audio():
    if "audio" not in request.files:
        return jsonify({"error": "missing 'audio' file"}), 400

    file = request.files["audio"]
    if file.filename == "":
        return jsonify({"error": "empty filename"}), 400

    # Read the entire upload into memory so we can check size and still pass a stream
    audio_bytes = file.read()

    # ── Hard size guard: empty / near-empty blob means no real audio ──────────
    if len(audio_bytes) < _MIN_AUDIO_BYTES:
        return jsonify({"translated_text": "", "no_speech": True})

    try:
        raw = speech_to_text(BytesIO(audio_bytes), file.filename)
        no_speech = _is_no_speech(raw)
        return jsonify({
            "translated_text": "" if no_speech else raw.strip(),
            "no_speech": no_speech,
        })
    except Exception as e:
        # Any conversion/transcription failure → graceful no_speech (never 500 for audio errors)
        return jsonify({"translated_text": "", "no_speech": True, "_stt_error": str(e)})


@audio_bp.route("/tts", methods=["POST"])
def generate_audio():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "JSON body required"}), 400

    text = data.get("text", "").strip()
    lang = data.get("lang", "").strip().lower()

    if not text:
        return jsonify({"error": "'text' field cannot be empty"}), 400

    if lang not in ("hi", "en"):
        return jsonify({"error": "'lang' must be either 'hi' or 'en'"}), 400

    try:
        mp3_bytes = text_to_speech(text, lang)
        buf = BytesIO(mp3_bytes)
        buf.seek(0)
        return send_file(
            buf,
            mimetype="audio/mpeg",
            as_attachment=True,
            download_name=f"tts_{lang}.mp3"
        )
    except Exception as e:
        return jsonify({"error": "synthesis failed", "detail": str(e)}), 500
