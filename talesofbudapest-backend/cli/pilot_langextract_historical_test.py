import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("pilot-langextract-historical.py")
SPEC = importlib.util.spec_from_file_location("pilot_langextract_historical", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
COREF_SCRIPT = Path(__file__).with_name("pilot-constrained-coref.py")
COREF_SPEC = importlib.util.spec_from_file_location("pilot_constrained_coref", COREF_SCRIPT)
COREF = importlib.util.module_from_spec(COREF_SPEC)
assert COREF_SPEC and COREF_SPEC.loader
sys.modules[COREF_SPEC.name] = COREF
COREF_SPEC.loader.exec_module(COREF)


class JsonlResponseCacheTest(unittest.TestCase):
    def test_cache_key_covers_complete_request(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = MODULE.JsonlResponseCache(Path(directory) / "cache.jsonl")
            request = {"model": "cheap-model", "messages": [{"role": "user", "content": "page 46"}]}
            cache.put("primary", request, '{"extractions":[]}', {"cost": 0.002, "prompt_tokens": 100})

            self.assertEqual(cache.get("primary", request)["output"], '{"extractions":[]}')
            self.assertIsNone(cache.get("reference", request))
            self.assertIsNone(cache.get("primary", {**request, "model": "other-model"}))

            reloaded = MODULE.JsonlResponseCache(Path(directory) / "cache.jsonl")
            self.assertEqual(reloaded.get("primary", request)["usage"]["cost"], 0.002)

    def test_primary_cache_hit_does_not_call_or_bill_model(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = MODULE.JsonlResponseCache(Path(directory) / "cache.jsonl")
            model = MODULE.MeteredOpenAIModel(
                model_id="unused-model",
                api_key="unused-key",
                base_url="https://example.invalid/v1",
                temperature=0,
                max_cost_usd=0.01,
                cache=cache,
            )
            config = {"temperature": 0, "max_output_tokens": 100}
            request = model._build_chat_completions_params("same prompt", config)
            request["extra_body"] = {"provider": {"sort": "price"}}
            cache.put(
                "primary",
                request,
                json.dumps({"extractions": []}),
                {"prompt_tokens": 120, "completion_tokens": 10, "total_tokens": 130, "cost": 0.001},
            )

            result = model._process_single_prompt("same prompt", config)

            self.assertEqual(json.loads(result.output), {"extractions": []})
            self.assertEqual(model.usage["calls"], 0)
            self.assertEqual(model.usage["cache_hits"], 1)
            self.assertEqual(model.usage["cost"], 0)
            self.assertEqual(model.usage["saved_cost"], 0.001)


class LocalReferenceResolutionTest(unittest.TestCase):
    def test_possessive_and_pronoun_inherit_previous_person(self):
        pages = {46: "R. Efraim died. His tomb was visited; he may have been buried there."}
        items = [
            {
                "literal_subject": "R. Efraim",
                "resolved_subject": "R. Efraim",
                "reference_antecedent": None,
                "reference_status": "model_subject",
                "reference_resolution_source": None,
                "statement_en": "R. Efraim died.",
                "risk_flags": [],
                "evidence": [{"page_ref": 46, "start_offset": 0, "end_offset": 16}],
            },
            {
                "literal_subject": "His tomb",
                "resolved_subject": "His tomb",
                "reference_antecedent": None,
                "reference_status": "ambiguous",
                "reference_resolution_source": None,
                "statement_en": "His tomb was visited.",
                "risk_flags": [],
                "evidence": [{"page_ref": 46, "start_offset": 17, "end_offset": 67}],
            },
            {
                "literal_subject": "His tomb",
                "resolved_subject": "His tomb",
                "reference_antecedent": None,
                "reference_status": "ambiguous",
                "reference_resolution_source": None,
                "statement_en": "He may have been buried there.",
                "risk_flags": [],
                "evidence": [{"page_ref": 46, "start_offset": 17, "end_offset": 67}],
            },
        ]

        guards = MODULE.apply_reference_guards(items, pages)

        self.assertEqual(items[1]["resolved_subject"], "His tomb")
        self.assertEqual(items[1]["reference_antecedent"], "R. Efraim")
        self.assertEqual(items[2]["literal_subject"], "He")
        self.assertEqual(items[2]["resolved_subject"], "R. Efraim")
        self.assertEqual(guards["local_discourse_resolved"], 2)

    def test_descriptive_reference_uses_rolling_previous_page_memory(self):
        pages = {10: "The Obuda synagogue was renovated.", 11: "The synagogue retained its ornaments."}
        items = [
            {
                "literal_subject": "The Obuda synagogue", "resolved_subject": "The Obuda synagogue",
                "reference_antecedent": None, "reference_status": "model_subject", "reference_resolution_source": None,
                "statement_en": "The Obuda synagogue was renovated.", "risk_flags": [],
                "evidence": [{"page_ref": 10, "start_offset": 0, "end_offset": 35}],
            },
            {
                "literal_subject": "The synagogue", "resolved_subject": None,
                "reference_antecedent": None, "reference_status": "ambiguous", "reference_resolution_source": None,
                "statement_en": "The synagogue retained its ornaments.", "risk_flags": [],
                "evidence": [{"page_ref": 11, "start_offset": 0, "end_offset": 38}],
            },
        ]

        memory = MODULE.discourse_subject_memory(items, MODULE.reference_group_key(items[1]))

        self.assertIn("The Obuda synagogue", memory)
        self.assertTrue(MODULE.is_referential_subject("This building"))
        self.assertTrue(MODULE.is_referential_subject("The synagogue"))
        context = "The hospital of the community opened in 1931. [[This well-equipped institute]] had 43 beds."
        self.assertEqual(MODULE.nearest_structural_antecedent("This well-equipped institute", context), "The hospital of the community")

    def test_only_repeated_definite_descriptions_are_sent_to_coref(self):
        previous = {
            "literal_subject": "The Obuda synagogue", "resolved_subject": "The Obuda synagogue",
            "statement_en": "The Obuda synagogue was renovated.",
            "evidence": [{"page_ref": 10, "start_offset": 0, "end_offset": 35}],
        }
        repeated = {
            "literal_subject": "The synagogue", "resolved_subject": "The synagogue",
            "statement_en": "The synagogue retained its ornaments.",
            "evidence": [{"page_ref": 11, "start_offset": 0, "end_offset": 38}],
        }
        new_subject = {
            "literal_subject": "The opening ceremony", "resolved_subject": "The opening ceremony",
            "statement_en": "The opening ceremony took place later.",
            "evidence": [{"page_ref": 11, "start_offset": 39, "end_offset": 80}],
        }

        self.assertTrue(MODULE.needs_constrained_reference(repeated, [previous, repeated, new_subject]))
        self.assertFalse(MODULE.needs_constrained_reference(new_subject, [previous, repeated, new_subject]))
        new_subject["reference_status"] = "ambiguous"
        self.assertEqual(MODULE.finalize_new_definite_subjects([previous, repeated, new_subject]), 2)
        self.assertEqual(new_subject["reference_status"], "not_applicable")

    def test_internal_compact_id_is_rejected(self):
        pages = {151: "The temple served the congregation. It preserved tradition."}
        items = [{
            "literal_subject": "It", "resolved_subject": "c001", "reference_antecedent": "c001",
            "reference_status": "resolved_reference", "reference_resolution_source": "model",
            "statement_en": "It preserved tradition.", "risk_flags": [],
            "evidence": [{"page_ref": 151, "start_offset": 36, "end_offset": 59}],
        }]

        guards = MODULE.apply_reference_guards(items, pages)

        self.assertIsNone(items[0]["reference_antecedent"])
        self.assertEqual(items[0]["reference_status"], "ambiguous")
        self.assertEqual(guards["internal_ids_rejected"], 1)

    def test_constrained_link_overrides_wrong_free_text_resolution(self):
        item = {
            "literal_subject": "It", "resolved_subject": "loud sighs", "reference_antecedent": "loud sighs",
            "reference_status": "resolved_reference", "statement_en": "It preserved tradition.",
            "risk_flags": [], "evidence": [{"page_ref": 151, "start_offset": 100, "end_offset": 130}],
        }
        payload = {"results": {"r001": {
            "reference": {"page": 151, "start": 100, "end": 102, "text": "It", "reference_kind": "pronoun"},
            "antecedent": {"id": "m_1", "text": "The Rombach utca temple"},
            "chosen": "m_1", "verdict": "agreed",
        }}}

        summary = MODULE.apply_constrained_coref_results([item], [payload])

        self.assertEqual(item["resolved_subject"], "The Rombach utca temple")
        self.assertEqual(item["reference_antecedent"], "The Rombach utca temple")
        self.assertEqual(summary["resolved_leading_links"], 1)

    def test_constrained_link_is_not_copied_to_other_rows_sharing_evidence(self):
        evidence = [{
            "page_ref": 151, "start_offset": 100, "end_offset": 170,
            "quote": "Gone was the dirt, all shops closed, and the street became a promenade.",
        }]
        items = [
            {"literal_subject": "Gone was the dirt", "resolved_subject": "Gone was the dirt", "statement_en": "Gone was the dirt.", "risk_flags": [], "evidence": evidence},
            {"literal_subject": "the street", "resolved_subject": "the street", "statement_en": "The street became a promenade.", "risk_flags": [], "evidence": evidence},
        ]
        street_start = 100 + evidence[0]["quote"].index("the street")
        payload = {"results": {"r001": {
            "reference": {"page": 151, "start": street_start, "end": street_start + 10, "text": "the street", "reference_kind": "definite"},
            "antecedent": {"id": "m_1", "text": "Rombach utca"},
            "chosen": "m_1", "verdict": "agreed",
        }}}

        MODULE.apply_constrained_coref_results(items, [payload])

        self.assertNotIn("reference_links", items[0])
        self.assertEqual(items[1]["resolved_subject"], "Rombach utca")

    def test_role_antecedent_is_canonicalized_to_known_person(self):
        items = [
            {
                "literal_subject": "The rabbi", "resolved_subject": "Israel ben Salomon Wahrmann",
                "statement_en": "The rabbi was Israel ben Salomon Wahrmann.", "risk_flags": [],
                "evidence": [{"page_ref": 89, "start_offset": 100, "end_offset": 200, "quote": "The rabbi was Israel ben Salomon Wahrmann."}],
            },
            {
                "literal_subject": "He", "resolved_subject": "The rabbi",
                "statement_en": "He headed the community.", "risk_flags": [],
                "evidence": [{"page_ref": 89, "start_offset": 201, "end_offset": 225, "quote": "He headed the community."}],
            },
        ]
        payload = {"results": {"r001": {
            "reference": {"page": 89, "start": 201, "end": 203, "text": "He", "reference_kind": "pronoun"},
            "antecedent": {"id": "m_1", "page": 89, "start": 100, "end": 109, "text": "The rabbi"},
            "chosen": "m_1", "verdict": "agreed",
        }}}

        MODULE.apply_constrained_coref_results(items, [payload])

        self.assertEqual(items[1]["resolved_subject"], "Israel ben Salomon Wahrmann")


class BoundaryNormalizationTest(unittest.TestCase):
    def test_repairs_only_literal_page_edge_hyphen(self):
        words = {"supported"}
        repair = MODULE.boundary_repair(88, "Israel Wahrmann, sup-\n", 89, "ported by Janos", words)
        self.assertEqual(repair["normalized_text"], "supported")

    def test_does_not_join_earlier_hyphen_to_next_page(self):
        previous = "For I have re-\ndeemed them. They followed their"
        self.assertIsNone(MODULE.boundary_repair(519, previous, 520, "own tradition", set()))

    def test_removes_footer_and_joins_unhyphenated_page_continuation(self):
        pages = {
            519: "They followed their\nCOMMENTS ON THE ILLUSTRATIONS 505",
            520: "own tradition.",
        }
        text, _, _ = MODULE.build_normalized_document(pages, 520, 1, 500)
        self.assertEqual(text, "They followed their own tradition.")

    def test_rejects_caption_body_mashup(self):
        item = {
            "statement_en": "Istvan Zador made the drawing of the clinic in 1946.",
            "evidence": [{"quote": "Drawing by Istvan Zador, 1946 cozy atmosphere of the clinic."}],
        }
        self.assertIsNotNone(MODULE.deterministic_audit_rejection(item))

    def test_direct_predicate_copy_survives_bad_model_rejection(self):
        item = {
            "literal_subject": "Károly János Kohlmann",
            "statement_en": "Károly János Kohlmann held his position only for a short period.",
            "evidence": [{"quote": "He held his position only for a short period; he was forced to resign."}],
        }
        self.assertTrue(MODULE.deterministic_direct_entailment(item))

    def test_ocr_name_variants_deduplicate(self):
        left = {"resolved_subject": "Count József Szapary", "statement_en": "Count József Szapary was the director of the Pozsony school district."}
        right = {"resolved_subject": "Count J6zsef Szapary", "statement_en": "Count J6zsef Szapary was the director of the Pozsony school district."}
        self.assertTrue(MODULE.same_subject_duplicate(left, right))

    def test_caption_page_number_is_not_a_boundary_escalation(self):
        caption = {"evidence": [
            {"page_ref": 89, "quote": "The southern courtyard of the Orczy House, 1928"},
            {"page_ref": 90, "quote": "85."},
        ]}
        continuation = {"evidence": [
            {"page_ref": 88, "quote": "Israel Wahrmann, sup"},
            {"page_ref": 89, "quote": "ported by Janos Boraros"},
        ]}
        self.assertFalse(MODULE.boundary_requires_escalation(caption, 90))
        self.assertTrue(MODULE.boundary_requires_escalation(continuation, 89))


class ConstrainedCoreferenceTest(unittest.TestCase):
    def test_unambiguous_surname_alias_uses_full_person_entity(self):
        mentions = [
            {"type": "person", "named": True, "reference": False, "text": "Josef (Joseph) Bach", "entity_id": "old1"},
            {"type": "person", "named": True, "reference": False, "text": "Bach", "entity_id": "old2"},
        ]
        COREF.canonicalize_local_person_aliases("book", mentions)
        self.assertEqual(mentions[0]["entity_id"], mentions[1]["entity_id"])

    def test_single_letter_ocr_debris_is_not_an_antecedent(self):
        self.assertFalse(COREF.usable_antecedent({"text": "T"}))
        self.assertTrue(COREF.usable_antecedent({"text": "the Talmud"}))


if __name__ == "__main__":
    unittest.main()
