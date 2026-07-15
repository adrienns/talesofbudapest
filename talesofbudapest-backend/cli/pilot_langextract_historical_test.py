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


if __name__ == "__main__":
    unittest.main()
