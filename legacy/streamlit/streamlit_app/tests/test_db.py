"""Tests for the database layer: validation, audit logging and atomic import."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
from validation import ValidationError  # noqa: E402


class DatabaseTestCase(unittest.TestCase):
    """Each test runs against a fresh temporary SQLite file."""

    @classmethod
    def setUpClass(cls):
        cls._original_path = db.DB_PATH

    @classmethod
    def tearDownClass(cls):
        db.configure(cls._original_path)

    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self._tmp.close()
        db.configure(self._tmp.name)

    def tearDown(self):
        os.unlink(self._tmp.name)

    def valid_site(self, **overrides):
        data = {
            'name': 'Alpha', 'system_size_kwp': 500, 'site_type': 'Rooftop', 'contract_status': 'Yes',
            'onboard_date': '2024-01-01', 'pm_cost': 500, 'cctv_cost': 200, 'cleaning_cost': 300, 'spv_code': 'OS2',
        }
        data.update(overrides)
        return data


class TestSeedData(DatabaseTestCase):

    def test_defaults_seeded(self):
        self.assertEqual(len(db.get_spvs()), 8)
        self.assertEqual([t['tier_name'] for t in db.get_rate_tiers()], ['<20MW', '20-30MW', '30-40MW'])
        self.assertEqual(db.get_sites(), [])
        self.assertEqual(db.get_audit_log(), [])

    def test_spv_lookup_is_case_insensitive(self):
        self.assertEqual(db.get_spv_by_code('os2')['code'], 'OS2')
        self.assertIsNone(db.get_spv_by_code('nope'))
        self.assertIn('ESI10', db.get_spvs_by_code())


class TestSites(DatabaseTestCase):

    def test_create_normalises_and_audits(self):
        site = db.create_site(**self.valid_site(name='  Alpha  Site ', spv_code='os2', contract_status='yes'))
        self.assertEqual(site['name'], 'Alpha Site')
        self.assertEqual(site['spv_code'], 'OS2')
        self.assertEqual(site['spv_id'], '1')
        self.assertEqual(site['contract_status'], 'Yes')
        log = db.get_audit_log()
        self.assertEqual(len(log), 1)
        self.assertEqual((log[0]['table_name'], log[0]['action'], log[0]['record_id']), ('sites', 'create', site['id']))
        self.assertEqual(log[0]['new_values']['name'], 'Alpha Site')

    def test_create_rejects_invalid(self):
        with self.assertRaises(ValidationError) as ctx:
            db.create_site(**self.valid_site(name='', pm_cost=-5))
        self.assertEqual(len(ctx.exception.errors), 2)
        self.assertEqual(db.get_sites(), [])
        self.assertEqual(db.get_audit_log(), [])

    def test_update_records_only_changed_fields(self):
        site = db.create_site(**self.valid_site())
        updated = db.update_site(site['id'], pm_cost=750, spv_code='AD1')
        self.assertEqual(updated['pm_cost'], 750)
        self.assertEqual(updated['spv_code'], 'AD1')
        self.assertEqual(updated['spv_id'], '2')
        entry = db.get_audit_log(table_name='sites', action='update')[0]
        self.assertEqual(set(entry['new_values']), {'pm_cost', 'spv_code', 'spv_id'})
        self.assertEqual(entry['old_values']['pm_cost'], 500)

    def test_update_no_change_writes_no_audit(self):
        site = db.create_site(**self.valid_site())
        db.update_site(site['id'], pm_cost=500)
        self.assertEqual(len(db.get_audit_log()), 1)

    def test_update_rejects_invalid_and_keeps_record(self):
        site = db.create_site(**self.valid_site())
        with self.assertRaises(ValidationError):
            db.update_site(site['id'], system_size_kwp=-1)
        self.assertEqual(db.get_site_by_id(site['id'])['system_size_kwp'], 500)
        self.assertIsNone(db.update_site('missing', name='x'))

    def test_delete_keeps_snapshot_in_audit(self):
        site = db.create_site(**self.valid_site())
        self.assertTrue(db.delete_site(site['id']))
        self.assertFalse(db.delete_site(site['id']))
        entry = db.get_audit_log(action='delete')[0]
        self.assertEqual(entry['old_values']['name'], 'Alpha')

    def test_find_sites_by_name(self):
        site = db.create_site(**self.valid_site())
        self.assertEqual(len(db.find_sites_by_name(' alpha ')), 1)
        self.assertEqual(db.find_sites_by_name('alpha', exclude_id=site['id']), [])
        self.assertEqual(db.find_sites_by_name(''), [])


class TestImport(DatabaseTestCase):

    def test_import_replaces_atomically(self):
        db.create_site(**self.valid_site(name='Old'))
        imported = db.import_sites([
            self.valid_site(name='New 1', source_sheet='Portfolio Tracker', source_row=5),
            self.valid_site(name='New 2', contract_status='No', source_row=6),
        ])
        self.assertEqual([s['name'] for s in imported], ['New 1', 'New 2'])
        self.assertEqual([s['name'] for s in db.get_sites()], ['New 1', 'New 2'])
        entry = db.get_audit_log(action='import')[0]
        self.assertEqual(entry['old_values'], {'sites_replaced': 1})
        self.assertEqual(entry['new_values']['sites_imported'], 2)

    def test_invalid_row_aborts_whole_import(self):
        db.create_site(**self.valid_site(name='Keep me'))
        with self.assertRaises(ValidationError) as ctx:
            db.import_sites([self.valid_site(name='Fine'), self.valid_site(name='Broken', system_size_kwp='abc')])
        self.assertIn('Broken', ctx.exception.errors[0])
        self.assertEqual([s['name'] for s in db.get_sites()], ['Keep me'])

    def test_import_append_mode(self):
        db.create_site(**self.valid_site(name='Existing'))
        db.import_sites([self.valid_site(name='Added')], replace=False)
        self.assertEqual(len(db.get_sites()), 2)


class TestRepair(DatabaseTestCase):

    def test_repair_spv_links(self):
        site = db.create_site(**self.valid_site())
        with db.get_db_connection() as conn:
            conn.execute("UPDATE sites SET spv_id = NULL, spv_code = 'os2' WHERE id = ?", (site['id'],))
        self.assertEqual(db.repair_spv_links(), 1)
        fixed = db.get_site_by_id(site['id'])
        self.assertEqual((fixed['spv_code'], fixed['spv_id']), ('OS2', '1'))
        self.assertEqual(db.repair_spv_links(), 0)


class TestRateTiers(DatabaseTestCase):

    def test_update_rate_tier(self):
        self.assertTrue(db.update_rate_tier('1', 2.25))
        self.assertEqual(db.get_rate_tiers()[0]['rate_per_kwp'], 2.25)
        entry = db.get_audit_log(table_name='rate_tiers')[0]
        self.assertEqual((entry['old_values']['rate_per_kwp'], entry['new_values']['rate_per_kwp']), (2.0, 2.25))
        self.assertFalse(db.update_rate_tier('99', 1.0))
        with self.assertRaises(ValidationError):
            db.update_rate_tier('1', 0)


class TestCMDaysUsage(DatabaseTestCase):

    def test_upsert_and_delete(self):
        created = db.upsert_cm_days_usage('2024-03', 1.5, '  Inverter fault ')
        self.assertEqual((created['days_used'], created['notes']), (1.5, 'Inverter fault'))
        updated = db.upsert_cm_days_usage('2024-03', 2, None)
        self.assertEqual(updated['id'], created['id'])
        self.assertEqual(updated['days_used'], 2)
        self.assertEqual([e['action'] for e in db.get_audit_log(table_name='cm_days_usage')], ['update', 'create'])
        self.assertTrue(db.delete_cm_days_usage('2024-03'))
        self.assertEqual(db.get_cm_days_usage(), [])

    def test_validation(self):
        with self.assertRaises(ValidationError):
            db.upsert_cm_days_usage('2024-13', 1)
        with self.assertRaises(ValidationError):
            db.upsert_cm_days_usage('2024-03', -1)


if __name__ == '__main__':
    unittest.main()
