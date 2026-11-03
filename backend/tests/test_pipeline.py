from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.pipeline import main

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


class PipelineTests(unittest.TestCase):
    def test_offline_pipeline_writes_json(self) -> None:
        output = Path(__file__).resolve().parent / ".tmp-events.json"
        try:
            code = main(
                [
                    "--offline",
                    "--no-ai",
                    "--no-geocode",
                    "--fixture-dir",
                    str(FIXTURES),
                    "--sources",
                    "burg-ronneburg",
                    "--out",
                    str(output),
                ]
            )
            self.assertEqual(code, 0)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["count"], 1)
            event = payload["events"][0]
            self.assertEqual(event["title"], "Ronneburger Burgweihnacht")
            self.assertEqual(event["category"], "markt")
            self.assertAlmostEqual(event["lat"], 50.2177, places=2)
            self.assertTrue(event["dedupe_key"])
        finally:
            output.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
