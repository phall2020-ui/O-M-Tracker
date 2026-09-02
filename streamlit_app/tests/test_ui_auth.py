"""Tests for the optional password gate (no Streamlit runtime required)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ui  # noqa: E402


class TestPasswordsMatch(unittest.TestCase):

    def test_match(self):
        self.assertTrue(ui.passwords_match('secret', 'secret'))

    def test_mismatch_and_empty(self):
        self.assertFalse(ui.passwords_match('secret', 'Secret'))
        self.assertFalse(ui.passwords_match('', 'secret'))
        self.assertFalse(ui.passwords_match('secret', ''))

    def test_app_password_from_env(self):
        previous = os.environ.get('APP_PASSWORD')
        try:
            os.environ['APP_PASSWORD'] = '  hunter2  '
            self.assertEqual(ui.app_password(), 'hunter2')
            os.environ['APP_PASSWORD'] = ''
            # No env password — secrets file is absent in tests
            self.assertIn(ui.app_password(), (None, ''))
        finally:
            if previous is None:
                os.environ.pop('APP_PASSWORD', None)
            else:
                os.environ['APP_PASSWORD'] = previous


if __name__ == '__main__':
    unittest.main()
