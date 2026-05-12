import os
import mimetypes
import tempfile
import wave
import numpy as np
import av

from google import genai
from google.genai import types
from google.cloud import texttospeech

# ========== CONFIG ==========
API_KEY = os.environ.get("GOOGLE_API_KEY_2", "")
client = genai.Client(api_key=API_KEY)
_tts_client = None


def _get_tts_client():
    global _tts_client
    if _tts_client is None:
        _tts_client = texttospeech.TextToSpeechClient()
    return _tts_client


VOICE_MAP = {
    "hi": {"language_code": "hi-IN", "voice_name": "hi-IN-Standard-F"},
    "en": {"language_code": "en-US", "voice_name": "en-US-Standard-C"},
}


# ========== HELPERS ==========
def _guess_mime(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def _safe_int(x):
    """Try to coerce x to int, return None on failure."""
    try:
        return int(x)
    except Exception:
        return None


def _extract_channels_from_layout(layout):
    """
    Safely extract number of channels from frame.layout.
    layout.channels could be int, or a sequence (tuple/list) of channel names.
    """
    if not layout:
        return None
    ch = getattr(layout, "channels", None)
    if ch is None:
        return None
    if isinstance(ch, (list, tuple)):
        return len(ch) if len(ch) > 0 else None
    return _safe_int(ch)


def _normalize_shape(shape):
    """
    Ensure shape is a tuple of ints (or None where coercion fails).
    """
    try:
        return tuple(_safe_int(d) for d in shape)
    except Exception:
        return tuple(None for _ in shape)


def _ndarray_to_pcm_bytes(arr: np.ndarray, target_channels: int) -> bytes:
    """
    Convert ndarray from frame.to_ndarray() to interleaved int16 PCM bytes.
    Handles 1D (mono), 2D (channels,samples) or (samples,channels), and odd dtypes.
    """
    if arr is None:
        return b""

    # If object dtype, try to coerce
    if arr.dtype == np.dtype("O"):
        try:
            arr = np.asarray(arr, dtype=np.float32)
        except Exception:
            try:
                flat = np.hstack([np.asarray(x).ravel() for x in arr])
                arr = flat.astype(np.int16)
            except Exception:
                return b""

    # Ensure numeric; handle floats by scaling
    if not np.issubdtype(arr.dtype, np.integer):
        if np.issubdtype(arr.dtype, np.floating):
            arr = (arr * 32767.0).clip(-32768, 32767).astype(np.int16)
        else:
            try:
                arr = arr.astype(np.int16)
            except Exception:
                arr = np.asarray(arr, dtype=np.int16)

    dims = _normalize_shape(arr.shape)

    if arr.ndim == 1:
        # mono samples
        if target_channels == 1:
            return arr.tobytes()
        else:
            tiled = np.tile(arr[:, None], (1, target_channels)).reshape(-1)
            return tiled.astype(np.int16).tobytes()

    elif arr.ndim == 2:
        dim0 = dims[0]
        dim1 = dims[1] if len(dims) > 1 else None

        # If first axis equals channels -> (channels, samples)
        if dim0 is not None and dim0 == target_channels:
            interleaved = arr.T.reshape(-1)
            return interleaved.astype(np.int16).tobytes()

        # If second axis equals channels -> (samples, channels)
        if dim1 is not None and dim1 == target_channels:
            return arr.reshape(-1).astype(np.int16).tobytes()

        # If small first axis, prefer (channels, samples)
        if dim0 is not None and 1 <= dim0 <= 8:
            interleaved = arr.T.reshape(-1)
            return interleaved.astype(np.int16).tobytes()
        if dim1 is not None and 1 <= dim1 <= 8:
            return arr.reshape(-1).astype(np.int16).tobytes()

        # fallback flatten
        return arr.reshape(-1).astype(np.int16).tobytes()

    else:
        return arr.reshape(-1).astype(np.int16).tobytes()


# ========== WEBM -> WAV CONVERTER (ROBUST) ==========
def convert_webm_to_wav(input_path: str, output_path: str, debug: bool = False) -> None:
    """
    Robustly converts a .webm/Opus file to 16-bit PCM WAV using PyAV.
    - Buffers initial frames to infer channels and sample rate
    - Handles frames where layout is missing or odd ndarray shapes
    - Raises informative RuntimeError on failure
    """
    try:
        container = av.open(input_path)
    except Exception as e:
        raise RuntimeError(f"Failed to open input file '{input_path}': {e}")

    audio_stream = next((s for s in container.streams if s.type == "audio"), None)
    if audio_stream is None:
        container.close()
        raise ValueError("No audio stream found in input file.")

    buffered_frames = []
    inferred_channels = None
    inferred_rate = None
    max_buffer_frames = 8

    try:
        frame_counter = 0
        # Buffer a few frames to infer channels/rate
        for frame in container.decode(audio_stream):
            frame_counter += 1
            try:
                arr = frame.to_ndarray(format="s16")
            except Exception:
                try:
                    arr = frame.to_ndarray()
                except Exception:
                    if debug:
                        print(f"[convert] Skipping frame #{frame_counter} — couldn't get ndarray")
                    continue

            layout_channels = _extract_channels_from_layout(getattr(frame, "layout", None))

            if layout_channels is None:
                # infer from ndarray
                if arr is None:
                    continue
                if arr.ndim == 1:
                    channels = 1
                elif arr.ndim == 2:
                    dims = _normalize_shape(arr.shape)
                    if dims[0] is not None and 1 <= dims[0] <= 8:
                        channels = dims[0]
                    elif dims[1] is not None and 1 <= dims[1] <= 8:
                        channels = dims[1]
                    else:
                        channels = 1
                else:
                    channels = 1
            else:
                channels = layout_channels

            rate = _safe_int(frame.sample_rate or getattr(audio_stream, "sample_rate", None) or 48000)

            if inferred_channels is None and channels is not None:
                inferred_channels = int(channels)
            if inferred_rate is None and rate is not None:
                inferred_rate = int(rate)

            buffered_frames.append((arr, int(inferred_channels) if inferred_channels is not None else None, int(inferred_rate) if inferred_rate is not None else None))

            if debug:
                sh = None if arr is None else arr.shape
                print(f"[convert] buffered frame #{frame_counter}: shape={sh}, chans={channels}, rate={rate}")

            if len(buffered_frames) >= max_buffer_frames:
                break

        # If still unknown, try some more frames
        if inferred_channels is None:
            extra_tries = 8
            for frame in container.decode(audio_stream):
                try:
                    arr = frame.to_ndarray(format="s16")
                except Exception:
                    try:
                        arr = frame.to_ndarray()
                    except Exception:
                        continue
                if arr is None:
                    continue
                if arr.ndim == 1:
                    inferred_channels = 1
                elif arr.ndim == 2:
                    dims = _normalize_shape(arr.shape)
                    if dims[0] is not None and 1 <= dims[0] <= 8:
                        inferred_channels = dims[0]
                    elif dims[1] is not None and 1 <= dims[1] <= 8:
                        inferred_channels = dims[1]
                    else:
                        inferred_channels = 1
                else:
                    inferred_channels = 1
                buffered_frames.append((arr, int(inferred_channels), int(frame.sample_rate or inferred_rate or 48000)))
                break
                extra_tries -= 1
                if extra_tries <= 0:
                    break

        if inferred_channels is None:
            raise RuntimeError("# channels not specified or could not be inferred from audio frames.")

        if inferred_rate is None:
            inferred_rate = 48000

        # Open WAV and write buffered + remaining frames
        sampwidth = 2
        wav_f = wave.open(output_path, "wb")
        wav_f.setnchannels(int(inferred_channels))
        wav_f.setsampwidth(sampwidth)
        wav_f.setframerate(int(inferred_rate))

        for arr, _ch, _r in buffered_frames:
            if arr is None:
                continue
            pcm_bytes = _ndarray_to_pcm_bytes(arr, int(inferred_channels))
            wav_f.writeframes(pcm_bytes)

        for frame in container.decode(audio_stream):
            try:
                arr = frame.to_ndarray(format="s16")
            except Exception:
                try:
                    arr = frame.to_ndarray()
                except Exception:
                    if debug:
                        print("[convert] Skipping a frame while writing remainder")
                    continue
            if arr is None:
                continue
            pcm_bytes = _ndarray_to_pcm_bytes(arr, int(inferred_channels))
            wav_f.writeframes(pcm_bytes)

        wav_f.close()
        container.close()
        if debug:
            print(f"[convert] Successfully wrote WAV: {output_path} (channels={inferred_channels}, rate={inferred_rate})")

    except Exception as e:
        try:
            container.close()
        except Exception:
            pass
        raise RuntimeError(f"Failed to convert .webm to .wav: {e}")


# ========== SPEECH TO TEXT ==========
_STT_PROMPT = (
    "Transcribe the spoken words in this audio recording to English text. "
    "Output only the transcription — no labels, no punctuation corrections, no extra commentary. "
    "If the audio contains no speech at all (only silence, background noise, music, or unintelligible sounds), "
    "respond with exactly the token: NO_SPEECH_DETECTED"
)

def speech_to_text(file_stream, filename, prompt_text=None, debug: bool = False):
    if prompt_text is None:
        prompt_text = _STT_PROMPT
    """
    Accepts uploaded file_stream and filename.
    If the file is .webm it gets converted to .wav first (using convert_webm_to_wav).
    Uploads file to Gemini and requests speech->text with the provided prompt.
    If debug=True, the converter prints diagnostic info to stdout.
    Returns Gemini response.text on success, or raises RuntimeError with details on failure.
    """
    mime_type = _guess_mime(filename)
    suffix = os.path.splitext(filename)[1] or ""

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    wav_tmp_path = None

    try:
        data = file_stream.read()
        if isinstance(data, str):
            data = data.encode("utf-8")
        tmp.write(data)
        tmp.close()

        if suffix.lower() == ".webm":
            wav_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            wav_tmp_path = wav_tmp.name
            wav_tmp.close()
            try:
                convert_webm_to_wav(tmp_path, wav_tmp_path, debug=debug)
            except Exception as e:
                # raise with JSON-like dict as earlier usage expected
                raise RuntimeError({"detail": f"Failed to convert .webm to .wav: {e}", "error": "translation failed"})
            upload_path = wav_tmp_path
            mime_type = "audio/wav"
        else:
            upload_path = tmp_path

        upload_config = types.UploadFileConfig(display_name=filename, mime_type=mime_type)
        uploaded = client.files.upload(file=upload_path, config=upload_config)

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[
                types.Part(text=prompt_text),
                types.Part(
                    file_data=types.FileData(
                        mime_type=mime_type,
                        file_uri=uploaded.uri
                    )
                )
            ]
        )

        return response.text

    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        try:
            if wav_tmp_path and os.path.exists(wav_tmp_path):
                os.remove(wav_tmp_path)
        except Exception:
            pass


# ========== TRANSLATE TO HINDI ==========
def translate_to_hindi(english_text: str) -> str:
    if not english_text:
        return ""

    prompt = (
        "Translate the following English text into fluent, natural Hindi. "
        "Do not add explanations. Only return the translation.\n\n"
        f"{english_text}"
    )

    response = client.models.generate_content(model="gemini-2.5-flash-lite", contents=[types.Part(text=prompt)])
    return response.text.strip()


# ========== TEXT TO SPEECH ==========
def text_to_speech(text: str, lang: str):
    if not text:
        raise ValueError("Empty text provided")

    voice_settings = VOICE_MAP.get(lang, VOICE_MAP["en"])
    language_code = voice_settings["language_code"]
    voice_name = voice_settings["voice_name"]

    if lang == "hi":
        text_to_speak = translate_to_hindi(text)
    else:
        text_to_speak = text

    synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)
    voice = texttospeech.VoiceSelectionParams(language_code=language_code, name=voice_name)
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        effects_profile_id=["small-bluetooth-speaker-class-device"],
        speaking_rate=1,
        pitch=1,
    )

    response = _get_tts_client().synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )
    return response.audio_content
