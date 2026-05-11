import re

# Acronyms that TTS engines commonly mispronounce
_ACRONYM_MAP = {
    "RPwD": "Rights of Persons with Disabilities",
    "NHFDC": "National Handicapped Finance and Development Corporation",
    "CBSE": "Central Board of Secondary Education",
    "NCERT": "National Council of Educational Research and Training",
    "IRCTC": "Indian Railway Catering and Tourism Corporation",
    "NCPEDP": "National Centre for Promotion of Employment for Disabled People",
    "MSJE": "Ministry of Social Justice and Empowerment",
    "UGC": "University Grants Commission",
    "IIT": "Indian Institute of Technology",
    "NIT": "National Institute of Technology",
    "UPSC": "Union Public Service Commission",
    "SSC": "Staff Selection Commission",
    "PwD": "Person with Disability",
    "SHG": "Self Help Group",
    "NGO": "Non-Governmental Organisation",
    "ADIP": "Assistance to Disabled Persons scheme",
    "DDRC": "District Disability Rehabilitation Centre",
    "NIEPVD": "National Institute for the Empowerment of Persons with Visual Disabilities",
    "NAB": "National Association for the Blind",
    "DAISY": "Digital Accessible Information System",
    "JAWS": "Job Access With Speech",
}

# Compiled once at import time
_ACRONYM_RE = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in _ACRONYM_MAP) + r')\b'
)


def clean_for_display(text: str) -> str:
    """
    Strips all markdown/symbol noise so text is safe for clean visual rendering.
    Preserves natural sentence flow.
    """
    if not text:
        return ""

    # Remove fenced code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]*`', '', text)

    # Remove headings (# Title)
    text = re.sub(r'^\s*#{1,6}\s+', '', text, flags=re.MULTILINE)

    # Remove bold/italic markers (**text**, *text*, __text__, _text_)
    text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,2}(.*?)_{1,2}', r'\1', text)

    # Convert markdown links [label](url) → label
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)

    # Remove citation tags like [1], [2], [source]
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\[source[^\]]*\]', '', text, flags=re.IGNORECASE)

    # Remove blockquote markers
    text = re.sub(r'^\s*>\s?', '', text, flags=re.MULTILINE)

    # Remove horizontal rules
    text = re.sub(r'^\s*[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)

    # Convert bullet/numbered list items to flowing prose
    # Replace "- item" or "* item" with the item followed by a period if needed
    text = re.sub(r'^\s*[-*•]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+[.)]\s+', '', text, flags=re.MULTILINE)

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Remove standalone asterisks or underscores left behind
    text = re.sub(r'(?<!\w)[*_]+(?!\w)', '', text)

    # ── Nuclear strip ────────────────────────────────────────────────────────
    # Gemini sometimes ignores the persona and emits residual markdown symbols
    # across line-breaks (where the paired regex above cannot match).
    # Unconditionally remove every remaining asterisk and backtick.
    # Hash signs are removed only when not followed by a digit (preserve #1, #2).
    text = text.replace('*', '')
    text = text.replace('`', '')
    text = re.sub(r'#(?!\d)', '', text)

    # Collapse multiple blank lines into one paragraph break
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Collapse multiple spaces
    text = re.sub(r'[ \t]{2,}', ' ', text)

    return text.strip()


def clean_for_speech(text: str) -> str:
    """
    Further cleans display text for TTS:
    - Expands acronyms on first occurrence
    - Converts symbols to spoken equivalents
    - Removes anything that sounds wrong when read aloud
    - Flattens to a single paragraph (no newlines)
    """
    text = clean_for_display(text)
    if not text:
        return ""

    # Expand acronyms (only the first occurrence of each)
    seen = set()
    def _expand(m):
        key = m.group(1)
        if key not in seen:
            seen.add(key)
            return _ACRONYM_MAP[key]
        return key
    text = _ACRONYM_RE.sub(_expand, text)

    # Symbol substitutions
    text = text.replace('%', ' percent')
    text = text.replace('&', ' and ')
    text = text.replace('+', ' plus ')
    text = text.replace('=', ' equals ')
    text = text.replace('@', ' at ')
    text = re.sub(r'(\d)\s*[-–]\s*(\d)', r'\1 to \2', text)  # 5-10 → 5 to 10
    text = text.replace('/', ' or ')
    text = text.replace('₹', 'rupees ')
    text = text.replace('$', 'dollars ')
    text = text.replace('€', 'euros ')

    # Remove parenthetical citations like (Section 2, RPwD Act)
    text = re.sub(r'\([Ss]ection\s[\d\w,\s]+\)', '', text)

    # Remove remaining parenthetical numbers (1), (2)
    text = re.sub(r'\(\d+\)', '', text)

    # Flatten paragraphs into a single block for TTS
    text = text.replace('\n\n', '. ')
    text = text.replace('\n', ' ')

    # Fix double periods that appear after stripping
    text = re.sub(r'\.\s*\.', '.', text)

    # ── Hard nuclear strip for speech ────────────────────────────────────────
    # TTS reads '*' as "asterisk", '#' as "hash", '_' as "underscore".
    # Remove them unconditionally — these characters have no place in spoken text.
    text = text.replace('*', '')
    text = text.replace('#', '')
    text = text.replace('`', '')
    text = text.replace('_', ' ')   # underscore → space (e.g. file_name → file name)

    # Collapse spaces again
    text = re.sub(r' {2,}', ' ', text)

    return text.strip()
