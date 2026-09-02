"""Tests for CM days tracking (parity with the legacy TypeScript implementation)."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations  # noqa: E402
import cm_days  # noqa: E402

TIERS = calculations.DEFAULT_RATE_TIERS


def site(name, kwp, onboard, contracted='Yes', pm=0, cctv=0, cleaning=0):
    return {
        'name': name, 'system_size_kwp': kwp, 'contract_status': contracted, 'onboard_date': onboard,
        'pm_cost': pm, 'cctv_cost': cctv, 'cleaning_cost': cleaning,
    }


class TestHelpers(unittest.TestCase):

    def test_monthly_corrective_days(self):
        self.assertEqual(cm_days.calculate_monthly_corrective_days(12), 1.0)
        self.assertEqual(cm_days.calculate_monthly_corrective_days(24), 2.0)
        self.assertEqual(cm_days.calculate_monthly_corrective_days(15), 1.2)
        self.assertEqual(cm_days.calculate_monthly_corrective_days(0), 0.0)

    def test_portfolio_start_date_uses_contracted_only(self):
        sites = [
            site('A', 100, '2024-03-01'),
            site('B', 100, '2023-01-01', contracted='No'),
            site('C', 100, None),
            site('D', 100, '2024-01-15T00:00:00'),
        ]
        self.assertEqual(cm_days.get_portfolio_start_date(sites), '2024-01-15')
        self.assertIsNone(cm_days.get_portfolio_start_date([site('X', 1, None)]))

    def test_months_from_start(self):
        months = cm_days.get_months_from_start('2023-11-20', today=date(2024, 2, 10))
        self.assertEqual(months, ['2023-11', '2023-12', '2024-01', '2024-02'])
        self.assertEqual(cm_days.get_months_from_start('2024-02-01', today=date(2024, 2, 1)), ['2024-02'])

    def test_contracted_sites_for_month_uses_month_end(self):
        sites = [site('A', 100, '2024-02-29'), site('B', 100, '2024-03-01')]
        self.assertEqual([s['name'] for s in cm_days.get_contracted_sites_for_month(sites, '2024-02')], ['A'])
        self.assertEqual(len(cm_days.get_contracted_sites_for_month(sites, '2024-03')), 2)

    def test_format_year_month(self):
        self.assertEqual(cm_days.format_year_month('2024-01'), 'Jan 2024')
        self.assertEqual(cm_days.format_year_month('2023-12'), 'Dec 2023')


class TestTracking(unittest.TestCase):

    def test_ledger_accrues_as_sites_onboard(self):
        sites = [
            site('A', 12000, '2024-01-10', pm=1200),          # 12 MW -> 1.0 day/month
            site('B', 12000, '2024-03-05', cctv=600),          # +12 MW from March -> 2.0 days/month
            site('C', 5000, '2024-02-01', contracted='No'),    # ignored
        ]
        usage = [
            {'year_month': '2024-02', 'days_used': 0.5, 'notes': 'Inverter swap'},
            {'year_month': '2024-04', 'days_used': 3, 'notes': None},
        ]
        tracking = cm_days.calculate_cm_days_tracking(sites, usage, TIERS, today=date(2024, 4, 20))

        self.assertEqual(tracking['portfolio_start_date'], '2024-01-10')
        months = tracking['monthly_data']
        self.assertEqual([m['year_month'] for m in months], ['2024-01', '2024-02', '2024-03', '2024-04'])

        jan, feb, mar, apr = months
        self.assertEqual(jan['number_of_sites'], 1)
        self.assertEqual(jan['days_accumulated'], 1.0)
        self.assertEqual(jan['fixed_cost'], 1200)
        self.assertEqual(jan['portfolio_cost'], 12000 * 2.0)
        self.assertEqual(jan['tier_name'], '<20MW')

        self.assertEqual(feb['days_used'], 0.5)
        self.assertEqual(feb['days_remaining'], 0.5)
        self.assertEqual(feb['notes'], 'Inverter swap')
        self.assertEqual(feb['cumulative_remaining'], 1.5)

        self.assertEqual(mar['number_of_sites'], 2)
        self.assertEqual(mar['days_accumulated'], 2.0)
        self.assertEqual(mar['tier_name'], '20-30MW')
        self.assertEqual(mar['portfolio_cost'], 24000 * 1.8)
        self.assertEqual(mar['fixed_cost'], 1800)
        self.assertEqual(mar['total_fixed_cost'], 1800 + 24000 * 1.8)

        self.assertEqual(apr['days_used'], 3.0)
        self.assertEqual(apr['days_remaining'], -1.0)
        self.assertEqual(apr['cumulative_remaining'], 2.5)

        self.assertEqual(tracking['total_accumulated'], 6.0)
        self.assertEqual(tracking['total_used'], 3.5)
        self.assertEqual(tracking['total_remaining'], 2.5)
        self.assertEqual(tracking['orphan_usage'], [])

    def test_no_contracted_sites(self):
        usage = [{'year_month': '2024-01', 'days_used': 1, 'notes': None}]
        tracking = cm_days.calculate_cm_days_tracking([site('A', 100, None)], usage, TIERS)
        self.assertIsNone(tracking['portfolio_start_date'])
        self.assertEqual(tracking['monthly_data'], [])
        self.assertEqual(tracking['orphan_usage'], usage)

    def test_orphan_usage_reported(self):
        sites = [site('A', 12000, '2024-03-01')]
        usage = [
            {'year_month': '2023-12', 'days_used': 1, 'notes': None},
            {'year_month': '2024-03', 'days_used': 0.5, 'notes': None},
        ]
        tracking = cm_days.calculate_cm_days_tracking(sites, usage, TIERS, today=date(2024, 3, 31))
        self.assertEqual([u['year_month'] for u in tracking['orphan_usage']], ['2023-12'])
        self.assertEqual(tracking['total_used'], 0.5)


if __name__ == '__main__':
    unittest.main()
