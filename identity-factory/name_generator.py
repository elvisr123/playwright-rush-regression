"""Unlimited local first/last names. No AI or internet.

Real names from names.py are used first. After those pairs are taken,
new names are built from syllables so the pool does not run out.
"""

from __future__ import annotations

import random
import re

from names import FIRST_NAMES, LAST_NAMES

_FIRST_START = (
    "Al", "An", "Ar", "Bel", "Bri", "Ca", "Cam", "Car", "Cas", "Cel",
    "Cor", "Dal", "Dar", "Del", "El", "Eli", "Em", "Es", "Fa", "Fi",
    "Ga", "Gi", "Ha", "Hel", "Il", "Ir", "Ja", "Jo", "Jul", "Ka",
    "Ke", "Ki", "La", "Le", "Li", "Lo", "Lu", "Ma", "Mar", "Mel",
    "Mi", "Mo", "Na", "Ne", "Ni", "No", "Ol", "Or", "Pa", "Pe",
    "Ra", "Re", "Ri", "Ro", "Sa", "Se", "Si", "So", "Ta", "Te",
    "Ti", "To", "Va", "Ve", "Vi", "Wa", "Ya", "Za",
)
_FIRST_MID = (
    "da", "di", "la", "li", "lo", "ma", "mi", "na", "ne", "ni",
    "ra", "ri", "ro", "sa", "si", "ta", "te", "va", "vi",
)
_FIRST_END = (
    "na", "ne", "la", "le", "ra", "el", "an", "en", "in", "on",
    "ah", "ia", "a", "o", "y", "elle", "ina", "ora", "ara", "een",
)

_LAST_START = (
    "Ash", "Ber", "Cal", "Carr", "Dal", "Ell", "Fen", "Gar", "Hal", "Har",
    "Kel", "Lan", "Mar", "Nor", "Oak", "Pen", "Quill", "Raven", "Stan", "Thorn",
    "Val", "Whit", "Win", "York", "Bar", "Ben", "Col", "Dan", "East", "Fair",
    "Gold", "Hart", "Lind", "Moss", "North", "Pine", "River", "Stone", "West", "Wood",
)
_LAST_END = (
    "berg", "brook", "burg", "field", "ford", "ham", "hart", "land", "ley", "man",
    "ner", "ridge", "son", "stead", "stein", "ton", "well", "wood", "worth", "wright",
    "ez", "ski", "sen", "sson", "otti", "ini", "ova", "escu", "ian", "owski",
)

_NAME_RE = re.compile(r"^[A-Za-z]{2,16}$")


def _title(parts: str) -> str:
    return parts[:1].upper() + parts[1:].lower()


def generate_first_name() -> str:
    start = random.choice(_FIRST_START)
    if random.random() < 0.45:
        body = start + random.choice(_FIRST_MID) + random.choice(_FIRST_END)
    else:
        body = start + random.choice(_FIRST_END)
    return _title(body)[:16]


def generate_last_name() -> str:
    body = random.choice(_LAST_START) + random.choice(_LAST_END)
    return _title(body)[:18]


def _valid(name: str) -> bool:
    return bool(_NAME_RE.match(name))


def unused_person_name(used: set[tuple[str, str]]) -> tuple[str, str]:
    """Return a first+last pair not already stored in Excel.

    Prefers unused combinations from the real-name lists, then builds new
    names so creation can continue without a hard limit.
    """
    for _ in range(80):
        pair = (random.choice(FIRST_NAMES), random.choice(LAST_NAMES))
        if pair not in used:
            return pair

    for _ in range(8000):
        first = generate_first_name()
        last = generate_last_name()
        if not _valid(first) or not _valid(last):
            continue
        if first.lower() == last.lower():
            continue
        pair = (first, last)
        if pair not in used:
            return pair

    raise SystemExit("Could not allocate a unique name. Close Excel and try again.")
