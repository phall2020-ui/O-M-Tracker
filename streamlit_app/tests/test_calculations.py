"""
Test suite for calculation logic.
Ensures parity with the legacy TypeScript calculations.
"""

import unittest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations
import db


class TestCalculations(unittest.TestCase):
    """Test fee calculation functions."""
    
    def test_calculate_site_fixed_costs(self):
        """Test site fixed costs calculation: PM + CCTV + Cleaning"""
        # Test case 1: Basic calculation
        result = calculations.calculate_site_fixed_costs(500, 200, 300)
        self.assertEqual(result, 1000)
        
        # Test case 2: Zero values
        result = calculations.calculate_site_fixed_costs(0, 0, 0)
        self.assertEqual(result, 0)
        
        # Test case 3: Decimal values
        result = calculations.calculate_site_fixed_costs(500.50, 200.25, 300.75)
        self.assertEqual(result, 1001.50)
    
    def test_calculate_portfolio_cost(self):
        """Test portfolio cost calculation: System Size × Rate per kWp"""
        # Test case 1: 500 kWp at £2.00/kWp
        result = calculations.calculate_portfolio_cost(500, 2.0)
        self.assertEqual(result, 1000)
        
        # Test case 2: 1000 kWp at £1.80/kWp
        result = calculations.calculate_portfolio_cost(1000, 1.8)
        self.assertEqual(result, 1800)
        
        # Test case 3: Zero size
        result = calculations.calculate_portfolio_cost(0, 2.0)
        self.assertEqual(result, 0)
    
    def test_calculate_fixed_fee(self):
        """Test fixed fee calculation: Site Fixed Costs + Portfolio Cost"""
        # Test case 1: Basic calculation
        result = calculations.calculate_fixed_fee(1000, 1000)
        self.assertEqual(result, 2000)
        
        # Test case 2: Zero portfolio cost
        result = calculations.calculate_fixed_fee(500, 0)
        self.assertEqual(result, 500)
    
    def test_calculate_fee_per_kwp(self):
        """Test fee per kWp calculation: Fixed Fee / System Size (only if contracted)"""
        # Test case 1: Contracted site
        result = calculations.calculate_fee_per_kwp(2000, 500, True)
        self.assertEqual(result, 4.0)
        
        # Test case 2: Non-contracted site
        result = calculations.calculate_fee_per_kwp(2000, 500, False)
        self.assertEqual(result, 0)
        
        # Test case 3: Zero system size (avoid division by zero)
        result = calculations.calculate_fee_per_kwp(2000, 0, True)
        self.assertEqual(result, 0)
    
    def test_calculate_monthly_fee(self):
        """Test monthly fee calculation: Fixed Fee / 12"""
        # Test case 1: Basic calculation
        result = calculations.calculate_monthly_fee(1200)
        self.assertEqual(result, 100)
        
        # Test case 2: Non-divisible by 12
        result = calculations.calculate_monthly_fee(1000)
        self.assertAlmostEqual(result, 83.33, places=2)
    
    def test_calculate_corrective_days(self):
        """Test corrective days calculation: Capacity / 1000 / 12"""
        # Test case 1: 12000 kWp = 12 MW → 1 day/month
        result = calculations.calculate_corrective_days(12000)
        self.assertEqual(result, 1.0)
        
        # Test case 2: 24000 kWp = 24 MW → 2 days/month
        result = calculations.calculate_corrective_days(24000)
        self.assertEqual(result, 2.0)
        
        # Test case 3: Rounding - 15000/1000/12 = 1.25 → rounds to 1.2 (banker's rounding)
        result = calculations.calculate_corrective_days(15000)
        self.assertEqual(result, 1.2)  # 15/12 = 1.25, rounds to 1.2
    
    def test_determine_portfolio_tier(self):
        """Test portfolio tier determination based on total capacity."""
        tiers = calculations.DEFAULT_RATE_TIERS
        
        # Test case 1: < 20MW
        tier = calculations.determine_portfolio_tier(15, tiers)
        self.assertEqual(tier['tier_name'], '<20MW')
        self.assertEqual(tier['rate_per_kwp'], 2.0)
        
        # Test case 2: 20-30MW
        tier = calculations.determine_portfolio_tier(25, tiers)
        self.assertEqual(tier['tier_name'], '20-30MW')
        self.assertEqual(tier['rate_per_kwp'], 1.8)
        
        # Test case 3: 30-40MW
        tier = calculations.determine_portfolio_tier(35, tiers)
        self.assertEqual(tier['tier_name'], '30-40MW')
        self.assertEqual(tier['rate_per_kwp'], 1.7)
    
    def test_calculate_site_with_all_tiers(self):
        """Test full site calculation with all tiers."""
        site = {
            'name': 'Test Site',
            'system_size_kwp': 500,
            'contract_status': 'Yes',
            'pm_cost': 500,
            'cctv_cost': 200,
            'cleaning_cost': 300,
        }
        
        result = calculations.calculate_site_with_all_tiers(site)
        
        # Site fixed costs
        self.assertEqual(result['site_fixed_costs'], 1000)
        
        # Portfolio costs by tier
        self.assertEqual(result['portfolio_cost_20mw'], 1000)  # 500 × 2.0
        self.assertEqual(result['portfolio_cost_30mw'], 900)   # 500 × 1.8
        self.assertEqual(result['portfolio_cost_40mw'], 850)   # 500 × 1.7
        
        # Fixed fees by tier
        self.assertEqual(result['fixed_fee_20mw'], 2000)  # 1000 + 1000
        self.assertEqual(result['fixed_fee_30mw'], 1900)  # 1000 + 900
        self.assertEqual(result['fixed_fee_40mw'], 1850)  # 1000 + 850
        
        # Fee per kWp by tier (contracted)
        self.assertEqual(result['fee_per_kwp_20mw'], 4.0)  # 2000 / 500
        self.assertAlmostEqual(result['fee_per_kwp_30mw'], 3.8, places=2)  # 1900 / 500
        self.assertAlmostEqual(result['fee_per_kwp_40mw'], 3.7, places=2)  # 1850 / 500
        
        # Monthly fee (based on <20MW tier)
        self.assertAlmostEqual(result['monthly_fee'], 166.67, places=2)  # 2000 / 12
    
    def test_calculate_site_with_all_tiers_non_contracted(self):
        """Test site calculation for non-contracted site."""
        site = {
            'name': 'Test Site',
            'system_size_kwp': 500,
            'contract_status': 'No',
            'pm_cost': 500,
            'cctv_cost': 200,
            'cleaning_cost': 300,
        }
        
        result = calculations.calculate_site_with_all_tiers(site)
        
        # Fee per kWp should be 0 for non-contracted
        self.assertEqual(result['fee_per_kwp_20mw'], 0)
        self.assertEqual(result['fee_per_kwp_30mw'], 0)
        self.assertEqual(result['fee_per_kwp_40mw'], 0)
        
        # Monthly fee should be 0 for non-contracted
        self.assertEqual(result['monthly_fee'], 0)


class TestPortfolioSummary(unittest.TestCase):
    """Test portfolio summary calculations."""
    
    def test_calculate_portfolio_summary_empty(self):
        """Test portfolio summary with no sites."""
        result = calculations.calculate_portfolio_summary([])
        
        self.assertEqual(result['total_sites'], 0)
        self.assertEqual(result['contracted_sites'], 0)
        self.assertEqual(result['total_capacity_kwp'], 0)
        self.assertEqual(result['total_monthly_fee'], 0)
    
    def test_calculate_portfolio_summary_with_sites(self):
        """Test portfolio summary with sample sites."""
        sites = [
            {
                'name': 'Site 1',
                'system_size_kwp': 500,
                'contract_status': 'Yes',
                'pm_cost': 500,
                'cctv_cost': 200,
                'cleaning_cost': 300,
                'spv_code': 'OS2',
            },
            {
                'name': 'Site 2',
                'system_size_kwp': 1000,
                'contract_status': 'Yes',
                'pm_cost': 600,
                'cctv_cost': 250,
                'cleaning_cost': 350,
                'spv_code': 'OS2',
            },
            {
                'name': 'Site 3',
                'system_size_kwp': 750,
                'contract_status': 'No',
                'pm_cost': 400,
                'cctv_cost': 150,
                'cleaning_cost': 200,
                'spv_code': 'AD1',
            },
        ]
        
        result = calculations.calculate_portfolio_summary(sites)
        
        self.assertEqual(result['total_sites'], 3)
        self.assertEqual(result['contracted_sites'], 2)
        self.assertEqual(result['total_capacity_kwp'], 2250)
        self.assertEqual(result['contracted_capacity_kwp'], 1500)
        
        # Sites by SPV
        self.assertEqual(result['sites_by_spv']['OS2'], 2)
        self.assertEqual(result['sites_by_spv']['AD1'], 1)


class TestFormatting(unittest.TestCase):
    """Test formatting functions."""
    
    def test_format_currency(self):
        """Test currency formatting."""
        self.assertEqual(calculations.format_currency(1000), "£1,000.00")
        self.assertEqual(calculations.format_currency(1234.56), "£1,234.56")
        self.assertEqual(calculations.format_currency(0), "£0.00")
    
    def test_format_number(self):
        """Test number formatting."""
        self.assertEqual(calculations.format_number(1234.5678, 2), "1,234.57")
        self.assertEqual(calculations.format_number(1000, 0), "1,000")
        self.assertEqual(calculations.format_number(0.5, 1), "0.5")


if __name__ == '__main__':
    unittest.main()
