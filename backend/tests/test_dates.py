from __future__ import annotations

import unittest
from datetime import date

from backend.dates import find_date_range, parse_opening_hours


class DateParsingTests(unittest.TestCase):
    def test_same_month_range(self) -> None:
        result = find_date_range("Ronneburger Burgweihnacht 05.–06. Dezember 2026, Sa 12–20 Uhr")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.start, date(2026, 12, 5))
        self.assertEqual(result.end, date(2026, 12, 6))

    def test_two_month_range(self) -> None:
        result = find_date_range("28. Mai – 1. Juni 2027, jeweils 11–19 Uhr")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.start, date(2027, 5, 28))
        self.assertEqual(result.end, date(2027, 6, 1))

    def test_bis_range(self) -> None:
        result = find_date_range("7. bis 8. November 2026")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.start, date(2026, 11, 7))
        self.assertEqual(result.end, date(2026, 11, 8))

    def test_numeric_range(self) -> None:
        result = find_date_range("24.11.2026 – 22.12.2026")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.start, date(2026, 11, 24))
        self.assertEqual(result.end, date(2026, 12, 22))

    def test_single_day(self) -> None:
        result = find_date_range("Fantasy & Cosplay Picknick am 22. Mai 2027")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.start, result.end)

    def test_invalid_day_is_ignored(self) -> None:
        self.assertIsNone(find_date_range("32. Dezember 2026"))

    def test_opening_hours_prefers_weekday(self) -> None:
        hours = parse_opening_hours("Eintritt frei\nSa 12–20 Uhr, So 11–19 Uhr")
        self.assertEqual(hours, "Sa 12–20 Uhr, So 11–19 Uhr")


if __name__ == "__main__":
    unittest.main()
