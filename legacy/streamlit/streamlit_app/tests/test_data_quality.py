"""Tests for portfolio data-quality checks."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import data_quality  # noqa: E402

SPVS = [{'id': '1', 'code': 'OS2', 'name': 'Olympus Solar 2 Ltd'}]
TODAY = date(2024, 6, 1)


def site(**overrides):
    data = {
        'id': overrides.get('name', 'x'), 'name': 'Site', 'system_size_kwp': 500, 'contract_status': 'Yes',
        'onboard_date': '2024-01-01', 'pm_cost': 100, 'cctv_cost': 0, 'cleaning_cost': 0,
        'spv_id': '1', 'spv_code': 'OS2',
    }
    data.update(overrides)
    return data


def codes(issues):
    return sorted(i['code'] for i in issues)


class TestChecks(unittest.TestCase):

    def test_clean_site_has_no_issues(self):
        self.assertEqual(data_quality.check_sites([site()], SPVS, TODAY), [])

    def test_each_rule(self):
        self.assertEqual(codes(data_quality.check_sites([site(system_size_kwp=0)], SPVS, TODAY)), ['zero_size'])
        self.assertEqual(codes(data_quality.check_sites([site(spv_code='ZZZ', spv_id=None)], SPVS, TODAY)), ['unknown_spv'])
        self.assertEqual(codes(data_quality.check_sites([site(spv_id=None)], SPVS, TODAY)), ['spv_link'])
        self.assertEqual(codes(data_quality.check_sites([site(spv_code=None, spv_id=None)], SPVS, TODAY)), ['no_spv'])
        self.assertEqual(codes(data_quality.check_sites([site(onboard_date=None)], SPVS, TODAY)), ['no_onboard_date'])
        self.assertEqual(codes(data_quality.check_sites([site(onboard_date='2030-01-01')], SPVS, TODAY)), ['future_onboard'])
        self.assertEqual(codes(data_quality.check_sites([site(contract_status='No')], SPVS, TODAY)), ['date_not_contracted'])
        self.assertEqual(codes(data_quality.check_sites([site(pm_cost=0)], SPVS, TODAY)), ['zero_costs'])
        self.assertEqual(codes(data_quality.check_sites([site(system_size_kwp=250_000)], SPVS, TODAY)), ['large_size'])

    def test_duplicate_names_flag_every_copy(self):
        issues = data_quality.check_sites([site(id='a', name='Dup'), site(id='b', name=' dup ')], SPVS, TODAY)
        self.assertEqual(codes(issues), ['duplicate_name', 'duplicate_name'])

    def test_sorted_by_severity_and_summary(self):
        issues = data_quality.check_sites(
            [site(id='a', name='B', spv_code=None, spv_id=None), site(id='b', name='A', system_size_kwp=0), site(id='c', spv_id=None)],
            SPVS, TODAY,
        )
        self.assertEqual([i['severity'] for i in issues], ['error', 'warning', 'warning'])
        summary = data_quality.summarise(issues)
        self.assertEqual((summary['error'], summary['warning'], summary['info'], summary['total']), (1, 2, 0, 3))
        self.assertEqual(summary['fixable'], 1)
        self.assertEqual(summary['sites_affected'], 3)
        self.assertEqual(len(data_quality.issues_for_site(issues, 'b')), 1)
        frame = data_quality.issues_frame(issues)
        self.assertListEqual(list(frame.columns), ['Severity', 'Site', 'Issue'])
        self.assertTrue(data_quality.issues_frame([]).empty)


if __name__ == '__main__':
    unittest.main()
