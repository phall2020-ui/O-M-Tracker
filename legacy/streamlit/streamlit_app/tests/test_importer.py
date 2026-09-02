"""Tests for spreadsheet / JSON import parsing."""

import os
import sys
import unittest
from datetime import datetime

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import importer  # noqa: E402

SPVS = {
    'OS2': {'id': '1', 'code': 'OS2', 'name': 'Olympus Solar 2 Ltd'},
    'AD1': {'id': '2', 'code': 'AD1', 'name': 'AMPYR Distributed Energy 1 Ltd'},
}


def make_sheet(rows: list[dict], header_rows: int = 4, width: int = 25) -> pd.DataFrame:
    """Build a DataFrame that mimics the 'Portfolio Tracker' sheet layout."""
    data = [[None] * width for _ in range(header_rows)]
    for row in rows:
        line = [None] * width
        for key, col in importer.COLUMNS.items():
            if key in row:
                line[col] = row[key]
        data.append(line)
    return pd.DataFrame(data)


class TestParsePortfolioTracker(unittest.TestCase):

    def test_parses_clean_rows(self):
        df = make_sheet([
            {'name': 'Alpha', 'system_size_kwp': 500, 'contract_status': 'Yes',
             'onboard_date': datetime(2024, 1, 15), 'pm_cost': 500, 'cctv_cost': 200, 'cleaning_cost': 300, 'spv_code': 'OS2'},
            {'name': 'Beta', 'system_size_kwp': 1200.5, 'contract_status': 'No', 'spv_code': 'AD1'},
        ])
        result = importer.parse_portfolio_tracker(df, SPVS)
        self.assertEqual(len(result.rows), 2)
        self.assertEqual(result.total_errors, 0)
        alpha, beta = result.valid_sites
        self.assertEqual(alpha['name'], 'Alpha')
        self.assertEqual(alpha['onboard_date'], '2024-01-15')
        self.assertEqual(alpha['spv_id'], '1')
        self.assertEqual(alpha['source_row'], 5)
        self.assertEqual(alpha['source_sheet'], importer.SHEET_NAME)
        self.assertEqual(beta['source_row'], 6)
        self.assertEqual(beta['system_size_kwp'], 1200.5)
        self.assertEqual(result.summary()['contracted'], 1)

    def test_bad_cell_is_row_error_not_crash(self):
        df = make_sheet([
            {'name': 'Good', 'system_size_kwp': 100, 'contract_status': 'Yes', 'onboard_date': '01/03/2024', 'spv_code': 'OS2'},
            {'name': 'Bad size', 'system_size_kwp': 'TBC', 'spv_code': 'OS2'},
            {'name': 'Bad date', 'system_size_kwp': 100, 'contract_status': 'Yes', 'onboard_date': 'Q2', 'spv_code': 'OS2'},
        ])
        result = importer.parse_portfolio_tracker(df, SPVS)
        self.assertEqual(len(result.rows), 3)
        self.assertEqual(len(result.valid_sites), 1)
        self.assertEqual(len(result.error_rows), 2)
        self.assertEqual(result.error_rows[0].source_row, 6)
        self.assertEqual(result.error_rows[0].status, 'Error')

    def test_scans_beyond_legacy_row_68(self):
        rows = [{'name': f'Site {i}', 'system_size_kwp': 100, 'spv_code': 'OS2'} for i in range(80)]
        df = make_sheet(rows)
        result = importer.parse_portfolio_tracker(df, SPVS)
        self.assertEqual(len(result.rows), 80)
        self.assertEqual(result.rows[-1].source_row, 84)

    def test_stops_after_blank_run_and_skips_summary_rows(self):
        rows = [
            {'name': 'One', 'system_size_kwp': 100, 'spv_code': 'OS2'},
            {'name': 'Total', 'system_size_kwp': 100},
        ]
        rows += [{} for _ in range(12)]
        rows += [{'name': 'Footnote far below', 'system_size_kwp': 5}]
        df = make_sheet(rows)
        result = importer.parse_portfolio_tracker(df, SPVS)
        self.assertEqual([r.clean['name'] for r in result.rows], ['One'])
        self.assertEqual(len(result.skipped_rows), 1)
        self.assertIn('summary row', result.skipped_rows[0][1])

    def test_explicit_last_row_ignores_blank_run(self):
        rows = [{'name': 'One', 'system_size_kwp': 100, 'spv_code': 'OS2'}]
        rows += [{} for _ in range(12)]
        rows += [{'name': 'Two', 'system_size_kwp': 100, 'spv_code': 'OS2'}]
        df = make_sheet(rows)
        result = importer.parse_portfolio_tracker(df, SPVS, last_row=len(df))
        self.assertEqual(len(result.rows), 2)

    def test_duplicates_and_unknown_spv_are_warnings(self):
        df = make_sheet([
            {'name': 'Dup', 'system_size_kwp': 100, 'spv_code': 'OS2'},
            {'name': 'dup', 'system_size_kwp': 200, 'spv_code': 'NOPE'},
        ])
        result = importer.parse_portfolio_tracker(df, SPVS)
        self.assertEqual(result.total_errors, 0)
        self.assertEqual(len(result.valid_sites), 2)
        self.assertTrue(any('Duplicate' in w for w in result.rows[0].warnings))
        self.assertTrue(any('not a known SPV' in w for w in result.rows[1].warnings))
        self.assertEqual(result.rows[1].clean['spv_code'], 'NOPE')
        self.assertIsNone(result.rows[1].clean['spv_id'])

    def test_preview_frame_columns(self):
        df = make_sheet([{'name': 'Alpha', 'system_size_kwp': 500, 'spv_code': 'OS2'}])
        frame = importer.parse_portfolio_tracker(df, SPVS).preview_frame()
        self.assertListEqual(
            list(frame.columns),
            ['Row', 'Status', 'Site Name', 'Size (kWp)', 'Contract', 'Onboard Date', 'SPV',
             'PM Cost', 'CCTV Cost', 'Cleaning Cost', 'Issues'],
        )
        self.assertEqual(frame.iloc[0]['Status'], 'OK')


class TestParseJson(unittest.TestCase):

    def test_camel_and_snake_case(self):
        payload = [
            {'name': 'Legacy', 'systemSizeKwp': 750, 'contractStatus': 'Yes', 'onboardDate': '2023-06-01',
             'pmCost': 100, 'cctvCost': 50, 'cleaningCost': 25, 'spvCode': 'OS2', 'sourceRow': 9},
            {'name': 'Modern', 'system_size_kwp': 300, 'contract_status': 'No', 'spv_code': 'AD1'},
        ]
        result = importer.parse_json_sites(payload, SPVS)
        self.assertEqual(result.total_errors, 0)
        legacy, modern = result.valid_sites
        self.assertEqual(legacy['system_size_kwp'], 750)
        self.assertEqual(legacy['source_row'], 9)
        self.assertEqual(modern['spv_id'], '2')
        self.assertEqual(modern['source_sheet'], 'JSON import')

    def test_non_list_is_file_error(self):
        result = importer.parse_json_sites({'sites': []}, SPVS)
        self.assertTrue(result.file_errors)
        result = importer.parse_json_sites([1, 'x'], SPVS)
        self.assertEqual(len(result.skipped_rows), 2)


if __name__ == '__main__':
    unittest.main()
