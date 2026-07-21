import unittest

from noun_phrases import noun_phrase_rows


class Token:
    def __init__(self, text, *, lemma=None, pos="DET", tag="DT", ent_type="", dep=""):
        self.text = text
        self.lower_ = text.lower()
        self.lemma_ = lemma or self.lower_
        self.pos_ = pos
        self.tag_ = tag
        self.ent_type_ = ent_type
        self.dep_ = dep
        self.is_alpha = text.isalpha()


class Chunk:
    def __init__(self, text, tokens, root, start=0):
        self.text = text
        self._tokens = tokens
        self.root = root
        self.start_char = start
        self.end_char = start + len(text)

    def __iter__(self):
        return iter(self._tokens)


class Doc:
    def __init__(self, chunks):
        self.noun_chunks = chunks


class NounPhraseReferenceTests(unittest.TestCase):
    def test_latter_is_ordinal_anaphor(self):
        latter = Token("latter", lemma="latter", pos="ADJ", tag="JJ", dep="nsubj")
        row = noun_phrase_rows(Doc([Chunk("the latter", [Token("the"), latter], latter)]))[0]
        self.assertTrue(row["reference"])
        self.assertEqual(row["reference_kind"], "ordinal")
        self.assertEqual(row["ordinal_member"], "latter")

    def test_embedded_former_is_still_ordinal_anaphor(self):
        former = Token("former", lemma="former", pos="ADJ", tag="JJ", dep="pobj")
        tokens = [Token("some", pos="DET"), Token("of", pos="ADP"), Token("the"), former]
        row = noun_phrase_rows(Doc([Chunk("some of the former", tokens, former)]))[0]
        self.assertEqual(row["reference_kind"], "ordinal")
        self.assertEqual(row["ordinal_member"], "former")


if __name__ == "__main__":
    unittest.main()
