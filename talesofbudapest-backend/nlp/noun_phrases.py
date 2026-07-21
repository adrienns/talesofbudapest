"""Reusable noun-phrase candidate logic for coreference and subject memory.

Pure spaCy-chunk classification shared by ``cli/pilot-constrained-coref.py``
and ``nlp/gliner2_mentions.py``. Rows are reading-view relative; callers map
reading offsets back to immutable raw source offsets with their own mapper.
"""

from __future__ import annotations

import re
from typing import Any

PRONOUNS = {"he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs", "it", "its"}
DEFINITE = {"the", "this", "that", "these", "those"}
POSSESSIVE = {"his", "her", "hers", "their", "theirs", "its"}
ORDINAL_ANAPHORS = {"former", "latter"}
PERSON_HEADS = {
    "man", "woman", "girl", "boy", "child", "rabbi", "scholar", "author", "writer",
    "father", "mother", "son", "daughter", "husband", "wife", "brother", "sister", "visitor",
}
FEMALE_HEADS = {"woman", "girl", "mother", "daughter", "wife", "sister"}
MALE_HEADS = {"man", "boy", "father", "son", "husband", "brother"}
COLLECTIVE_HEADS = {"alumni", "community", "couple", "family", "group", "people", "public", "staff", "team"}
NON_ANTECEDENT_PRONOUNS = {"i", "me", "we", "us", "you", "who", "whom", "whose", "which", "what", "that"}

_TITLE_PATTERN = re.compile(r"^(?:(?:r|dr|mr|mrs)\.\s|(?:rabbi|saint|st\.)\b)", re.IGNORECASE)


def mention_type(chunk: Any) -> str:
    if chunk.root.pos_ == "PRON":
        return "person" if chunk.root.text.lower() not in {"it", "its"} else "thing"
    if chunk.root.ent_type_ in {"GPE", "LOC", "FAC"}:
        return "place"
    if chunk.root.lemma_.lower() in PERSON_HEADS or _TITLE_PATTERN.match(chunk.text):
        return "person"
    # Entity labels on a possessor must not leak to the whole noun phrase:
    # "Béla Lajta's art" is art, not a person.
    if chunk.root.ent_type_ == "PERSON":
        return "person"
    if chunk.root.lemma_.lower() in COLLECTIVE_HEADS:
        return "group"
    return "thing"


def modifiers(chunk: Any) -> list[str]:
    ignored = DEFINITE | POSSESSIVE | {"a", "an", "of", "and", "or"}
    return [token.lemma_.lower() for token in chunk if token != chunk.root and token.lemma_.lower() not in ignored and token.is_alpha]


def gender_hint(chunk: Any) -> str | None:
    """Only encode explicit lexical gender; never guess from a proper name."""
    head = chunk.root.lemma_.lower()
    if head in FEMALE_HEADS:
        return "female"
    if head in MALE_HEADS:
        return "male"
    return None


def number_hint(chunk: Any) -> str:
    if chunk.root.tag_ in {"NNS", "NNPS"} or any(token.lower_ in {"and", "nor"} for token in chunk):
        return "plural"
    return "singular"


def noun_phrase_rows(doc: Any) -> list[dict[str, Any]]:
    """Classify every noun chunk of a parsed reading-view document.

    Returns reading-relative candidate rows sorted by position. Deduplicates
    per span, preferring the reference reading of a span over a plain one.
    """
    rows: dict[tuple[int, int], dict[str, Any]] = {}
    for chunk in doc.noun_chunks:
        words = [token.text.lower() for token in chunk]
        first = words[0] if words else ""
        if len(words) == 1 and first in NON_ANTECEDENT_PRONOUNS:
            continue
        possessive = first in POSSESSIVE
        pronoun = first in PRONOUNS and not possessive
        definite = first in DEFINITE
        ordinal = next((word for word in words if word in ORDINAL_ANAPHORS), None)
        if len(words) == 1 and first in {"this", "that", "these", "those"}:
            # Deictic words without a noun are handled by sentence semantics,
            # not entity identity. Keep them out of the entity linker.
            definite = False
        named = any(token.pos_ == "PROPN" for token in chunk)
        reference = pronoun or possessive or definite or ordinal is not None
        row = {
            "reading_start": chunk.start_char,
            "reading_end": chunk.end_char,
            "text": chunk.text,
            "head": chunk.root.lemma_.lower(),
            "type": mention_type(chunk),
            "named": named,
            "modifiers": modifiers(chunk),
            "gender_hint": gender_hint(chunk),
            "number_hint": number_hint(chunk),
            "dependency": chunk.root.dep_,
            "reference": reference,
            "reference_kind": "ordinal" if ordinal else "possessive" if possessive else "pronoun" if pronoun else "definite" if definite else None,
            "ordinal_member": ordinal,
        }
        old = rows.get((chunk.start_char, chunk.end_char))
        if old is None or (row["reference"] and not old["reference"]):
            rows[(chunk.start_char, chunk.end_char)] = row
    return sorted(rows.values(), key=lambda row: (row["reading_start"], row["reading_end"]))
