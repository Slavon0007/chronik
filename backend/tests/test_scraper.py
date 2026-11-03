import unittest
from unittest.mock import patch
from backend.scraper import Source, fetch_pages
from backend.models import Category, PageContent

class TraversalTests(unittest.TestCase):
    def test_budget_origin_and_cycles(self):
        source = Source("test", "Test", "https://example.org/events", Category.MARKT, max_pages=2)
        page = PageContent(source.url, "Events", "", [], [("Mehr", "https://example.org/event/1"), ("Next", "https://other.org/event/2"), ("Weiter", source.url)])
        with patch("backend.scraper.fetch_page", return_value=page) as fetch:
            self.assertEqual(len(list(fetch_pages(source, object()))), 2)
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(fetch.call_args_list[1].args[0].url, "https://example.org/event/1")
