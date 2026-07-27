"""Narrator + isnad extraction from hadith text at display time.

The corpus stores narrator and chain inside the text itself (English opens with
"Narrated Abu Hurairah:" etc.; Arabic opens with the isnad: حدثنا فلان عن فلان…).
These helpers surface them as structured fields without re-ingesting anything.

ponytail: regex heuristics, not a transmitter-chain parser. They return None when
unsure ("where available" per spec). Upgrade path: parse isnads into a narrator
graph at ingest if the product ever needs per-transmitter data.
"""

import re

# English narrator openers, most-specific first.
_NARRATOR_PATTERNS = [
    re.compile(r"^Narrated\s+([^:]{2,70}):", re.IGNORECASE),  # Bukhari style
    re.compile(r"^It was narrated (?:from|that)\s+([^:]{2,70}?)\s+(?:that|said|:)"),  # Nasa'i/Ibn Majah
    re.compile(r"^On the authority of\s+([^,:]{2,70}?)\s*[,:(]"),  # Nawawi 40 style
    re.compile(r"^([A-Z][^.:]{2,70}?)\s+(?:narrated|reported|related)\b"),  # Muslim/Tirmidhi/Malik
]

# Diacritics/tatweel that may sit between the letters of a marker in real text.
_D = r"[ً-ٰٟۖ-ۭـ]*"


def _tolerant(marker: str) -> str:
    """Regex for an unpointed marker that matches regardless of vocalization:
    optional diacritics after every letter, any alef variant, flexible spaces."""
    out = []
    for ch in marker:
        if ch == " ":
            out.append(r"\s+")
        elif ch == "ا":
            out.append(f"[اأإآٱ]{_D}")
        else:
            out.append(re.escape(ch) + _D)
    return "".join(out)


# Chain opener — text must start with حدثنا/أخبرنا (± و prefix) to attempt a split.
_CHAIN_OPENER = re.compile(rf"^\s*(?:و{_D})?(?:{_tolerant('حدث')}|{_tolerant('اخبر')})")

# Matn (saying) start markers, unpointed — the chain is everything before the earliest.
_MATN_RE = re.compile(
    "|".join(
        _tolerant(m)
        for m in (
            "قال رسول الله",
            "قال النبي",
            "ان رسول الله",
            "ان النبي",
            "سمعت رسول الله",
            "سمعت النبي",
        )
    )
)


def extract_narrator(english: str | None) -> str | None:
    if not english:
        return None
    head = english.strip()[:200]
    for pat in _NARRATOR_PATTERNS:
        m = pat.match(head)
        if m:
            return m.group(1).strip().rstrip(",")
    return None


def extract_isnad(arabic: str | None) -> str | None:
    if not arabic:
        return None
    text = arabic.strip()
    if not _CHAIN_OPENER.match(text):
        return None
    m = _MATN_RE.search(text)
    if m is None or m.start() < 20:  # no marker, or "chain" too short to be one
        return None
    return text[: m.start()].strip().rstrip("،, قال")


def _demo() -> None:
    assert extract_narrator("Narrated `Umar bin Al-Khattab:The Prophet (ﷺ) said...") == "`Umar bin Al-Khattab"
    assert extract_narrator("Abu Huraira reported that there came a person...") == "Abu Huraira"
    assert extract_narrator("Ka'b bin Ujrah narrated:\"The Messenger...") == "Ka'b bin Ujrah"
    assert extract_narrator("It was narrated from 'Aishah that the Prophet said...") == "'Aishah"
    assert extract_narrator("Yahya related to me from Malik from Nafi that...") == "Yahya"
    assert extract_narrator("On the authority of Abu Hurairah (may Allah be pleased with him), who said...") == "Abu Hurairah"
    assert extract_narrator("While walking one day...") is None  # no opener -> None
    isnad = extract_isnad("حَدَّثَنَا قُتَيْبَةُ، عَنْ يَحْيَى، قَالَ رَسُولُ اللَّهِ ﷺ ...")
    assert isnad is not None and isnad.startswith("حَدَّثَنَا") and "قَالَ رَسُولُ" not in isnad
    assert extract_isnad("قال رسول الله ﷺ ...") is None  # no chain opener -> None
    print("hadith_meta self-check OK")


if __name__ == "__main__":
    _demo()
