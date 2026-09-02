"""Tests for input normalisation and validation."""

import os
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import validation  # noqa: E402

SPVS = {'OS2': {'id': '1', 'code': 'OS2', 'name': 'Olympus Solar 2 Ltd'}}


class TestPrimitiveParsers(unittest.TestCase):

    def test_parse_number_accepts_currency_strings(self):
        self.assertEqual(validation.parse_number('£1,250.50'), 1250.5)
        self.assertEqual(validation.parse_number(' 1 250 '), 1250.0)
        self.assertEqual(validation.parse_number('(100)'), -100.0)
        self.assertEqual(validation.parse_number(42), 42.0)

    def test_parse_number_blank_and_garbage(self):
        self.assertIsNone(validation.parse_number(None))
        self.assertIsNone(validation.parse_number(''))
        self.assertIsNone(validation.parse_number(float('nan')))
        with self.assertRaises(ValueError):
            validation.parse_number('TBC', 'Size')
        with self.assertRaises(ValueError):
            validation.parse_number(True)

    def test_parse_contract_status(self):
        for value in ('Yes', 'yes', ' Y ', 'TRUE', 1, True, 'Contracted'):
            self.assertEqual(validation.parse_contract_status(value), ('Yes', None), value)
        for value in ('No', 'n', 'FALSE', 0, None, '', float('nan'), 'TBC'):
            self.assertEqual(validation.parse_contract_status(value), ('No', None), value)
        status, warning = validation.parse_contract_status('Maybe')
        self.assertEqual(status, 'No')
        self.assertIn('Unrecognised', warning)

    def test_parse_site_type(self):
        self.assertEqual(validation.parse_site_type('ground mount'), ('Ground Mount', None))
        self.assertEqual(validation.parse_site_type('Roof'), ('Rooftop', None))
        self.assertEqual(validation.parse_site_type(None), ('Rooftop', None))
        site_type, warning = validation.parse_site_type('Floating')
        self.assertEqual(site_type, 'Rooftop')
        self.assertIsNotNone(warning)

    def test_parse_date_formats(self):
        self.assertEqual(validation.parse_date('2024-03-15'), '2024-03-15')
        self.assertEqual(validation.parse_date('15/03/2024'), '2024-03-15')
        self.assertEqual(validation.parse_date('15-03-2024'), '2024-03-15')
        self.assertEqual(validation.parse_date('2024-03-15T10:30:00'), '2024-03-15')
        self.assertEqual(validation.parse_date(datetime(2024, 3, 15, 9, 0)), '2024-03-15')
        self.assertEqual(validation.parse_date(date(2024, 3, 15)), '2024-03-15')
        self.assertEqual(validation.parse_date('Mar 2024'), '2024-03-01')
        self.assertEqual(validation.parse_date(45366), '2024-03-15')  # Excel serial
        self.assertIsNone(validation.parse_date(None))
        with self.assertRaises(ValueError):
            validation.parse_date('not a date')

    def test_normalise_spv_code(self):
        self.assertEqual(validation.normalise_spv_code(' os2 '), 'OS2')
        self.assertIsNone(validation.normalise_spv_code(''))
        self.assertIsNone(validation.normalise_spv_code(None))


class TestNormaliseSite(unittest.TestCase):

    def base(self, **overrides):
        data = {
            'name': '  Test   Site ',
            'system_size_kwp': '1,000',
            'site_type': 'rooftop',
            'contract_status': 'yes',
            'onboard_date': '01/02/2024',
            'pm_cost': '£500',
            'cctv_cost': 200,
            'cleaning_cost': None,
            'spv_code': 'os2',
        }
        data.update(overrides)
        return data

    def test_clean_record(self):
        clean, errors, warnings = validation.normalise_site(self.base(), SPVS)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(clean['name'], 'Test Site')
        self.assertEqual(clean['system_size_kwp'], 1000.0)
        self.assertEqual(clean['site_type'], 'Rooftop')
        self.assertEqual(clean['contract_status'], 'Yes')
        self.assertEqual(clean['onboard_date'], '2024-02-01')
        self.assertEqual(clean['pm_cost'], 500.0)
        self.assertEqual(clean['cctv_cost'], 200.0)
        self.assertEqual(clean['cleaning_cost'], 0.0)
        self.assertEqual(clean['spv_code'], 'OS2')
        self.assertEqual(clean['spv_id'], '1')

    def test_missing_name_and_negative_values_are_errors(self):
        clean, errors, _ = validation.normalise_site(
            self.base(name='  ', system_size_kwp=-5, pm_cost=-1), SPVS
        )
        self.assertIn('Site name is required', errors)
        self.assertTrue(any('negative' in e for e in errors))
        self.assertTrue(any('PM cost' in e for e in errors))

    def test_unparseable_values_are_errors_not_crashes(self):
        _, errors, _ = validation.normalise_site(
            self.base(system_size_kwp='TBC', onboard_date='soon', cctv_cost='n/a'), SPVS
        )
        self.assertEqual(len(errors), 3)

    def test_zero_size_warning_or_error(self):
        _, errors, warnings = validation.normalise_site(self.base(system_size_kwp=0), SPVS)
        self.assertEqual(errors, [])
        self.assertTrue(any('0 kWp' in w for w in warnings))
        _, errors, _ = validation.normalise_site(self.base(system_size_kwp=0), SPVS, require_positive_size=True)
        self.assertTrue(any('greater than zero' in e for e in errors))

    def test_unknown_spv_kept_but_unlinked(self):
        clean, errors, warnings = validation.normalise_site(self.base(spv_code='XYZ'), SPVS)
        self.assertEqual(errors, [])
        self.assertEqual(clean['spv_code'], 'XYZ')
        self.assertIsNone(clean['spv_id'])
        self.assertTrue(any('not a known SPV' in w for w in warnings))

    def test_contracted_without_date_warns(self):
        _, errors, warnings = validation.normalise_site(self.base(onboard_date=None), SPVS)
        self.assertEqual(errors, [])
        self.assertTrue(any('no onboard date' in w for w in warnings))

    def test_contracted_with_zero_costs_warns(self):
        _, _, warnings = validation.normalise_site(
            self.base(pm_cost=0, cctv_cost=0, cleaning_cost=0), SPVS
        )
        self.assertTrue(any('no fixed costs' in w for w in warnings))

    def test_source_row_coerced(self):
        clean, _, _ = validation.normalise_site(self.base(source_row='12', source_sheet=' Portfolio Tracker '), SPVS)
        self.assertEqual(clean['source_row'], 12)
        self.assertEqual(clean['source_sheet'], 'Portfolio Tracker')


class TestOtherValidators(unittest.TestCase):

    def test_validate_rate(self):
        self.assertEqual(validation.validate_rate('1.80'), 1.8)
        for bad in (0, -1, None, 'abc', 500):
            with self.assertRaises(validation.ValidationError):
                validation.validate_rate(bad)

    def test_validate_year_month(self):
        self.assertEqual(validation.validate_year_month(' 2024-03 '), '2024-03')
        for bad in ('2024-13', '24-03', '2024/03', None):
            with self.assertRaises(validation.ValidationError):
                validation.validate_year_month(bad)


if __name__ == '__main__':
    unittest.main()
