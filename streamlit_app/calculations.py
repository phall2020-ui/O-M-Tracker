"""
Fee calculation logic for Clearsol O&M Portfolio Tracker.
Replicates the spreadsheet formulas exactly.
"""

from typing import Optional
import db


# ============ Default Rate Tiers ============

DEFAULT_RATE_TIERS = [
    {'id': '1', 'tier_name': '<20MW', 'min_capacity_mw': 0, 'max_capacity_mw': 20, 'rate_per_kwp': 2.0},
    {'id': '2', 'tier_name': '20-30MW', 'min_capacity_mw': 20, 'max_capacity_mw': 30, 'rate_per_kwp': 1.8},
    {'id': '3', 'tier_name': '30-40MW', 'min_capacity_mw': 30, 'max_capacity_mw': 40, 'rate_per_kwp': 1.7},
]


# ============ Core Calculation Functions ============

def calculate_site_fixed_costs(pm_cost: float, cctv_cost: float, cleaning_cost: float) -> float:
    """
    Calculate site fixed costs.
    Site Fixed Costs = PM Cost + CCTV Cost + Cleaning Cost
    """
    return pm_cost + cctv_cost + cleaning_cost


def calculate_portfolio_cost(system_size_kwp: float, rate_per_kwp: float) -> float:
    """
    Calculate portfolio cost for a site.
    Portfolio Cost = System Size (kWp) × Rate per kWp (tier-based)
    """
    return system_size_kwp * rate_per_kwp


def calculate_fixed_fee(site_fixed_costs: float, portfolio_cost: float) -> float:
    """
    Calculate fixed fee.
    Fixed Fee = Site Fixed Costs + Portfolio Cost
    """
    return site_fixed_costs + portfolio_cost


def calculate_fee_per_kwp(fixed_fee: float, system_size_kwp: float, is_contracted: bool) -> float:
    """
    Calculate fee per kWp.
    Fee per kWp = Fixed Fee / System Size (only if contracted)
    """
    if not is_contracted or system_size_kwp == 0:
        return 0
    return fixed_fee / system_size_kwp


def calculate_monthly_fee(fixed_fee: float) -> float:
    """
    Calculate monthly fee.
    Monthly Fee = Fixed Fee / 12
    """
    return fixed_fee / 12


def determine_portfolio_tier(total_capacity_mw: float, tiers: Optional[list[dict]] = None) -> dict:
    """
    Determine the appropriate rate tier based on total portfolio capacity.
    """
    if tiers is None:
        tiers = db.get_rate_tiers() or DEFAULT_RATE_TIERS
    
    for tier in tiers:
        max_cap = tier.get('max_capacity_mw')
        if max_cap is None or total_capacity_mw < max_cap:
            return tier
    
    return tiers[-1] if tiers else DEFAULT_RATE_TIERS[-1]


def calculate_corrective_days(contracted_capacity_kwp: float) -> float:
    """
    Calculate corrective days allowed.
    Corrective Days = Capacity / 1000 / 12
    """
    return round((contracted_capacity_kwp / 1000 / 12) * 10) / 10


# ============ Site Calculation Functions ============

def calculate_site_with_all_tiers(site: dict, tiers: Optional[list[dict]] = None) -> dict:
    """
    Calculate all fee metrics for a site across all tiers.
    Returns the site dict with additional calculated fields.
    """
    if tiers is None:
        tiers = db.get_rate_tiers() or DEFAULT_RATE_TIERS
    
    # Get tier rates
    tier_20mw = next((t for t in tiers if t['tier_name'] == '<20MW'), tiers[0] if tiers else DEFAULT_RATE_TIERS[0])
    tier_30mw = next((t for t in tiers if t['tier_name'] == '20-30MW'), tiers[1] if len(tiers) > 1 else DEFAULT_RATE_TIERS[1])
    tier_40mw = next((t for t in tiers if t['tier_name'] == '30-40MW'), tiers[2] if len(tiers) > 2 else DEFAULT_RATE_TIERS[2])
    
    # Calculate site fixed costs
    site_fixed_costs = calculate_site_fixed_costs(
        site.get('pm_cost', 0),
        site.get('cctv_cost', 0),
        site.get('cleaning_cost', 0)
    )
    
    system_size = site.get('system_size_kwp', 0)
    is_contracted = site.get('contract_status') == 'Yes'
    
    # Calculate portfolio costs for each tier
    portfolio_cost_20mw = calculate_portfolio_cost(system_size, tier_20mw['rate_per_kwp'])
    portfolio_cost_30mw = calculate_portfolio_cost(system_size, tier_30mw['rate_per_kwp'])
    portfolio_cost_40mw = calculate_portfolio_cost(system_size, tier_40mw['rate_per_kwp'])
    
    # Calculate fixed fees for each tier
    fixed_fee_20mw = calculate_fixed_fee(site_fixed_costs, portfolio_cost_20mw)
    fixed_fee_30mw = calculate_fixed_fee(site_fixed_costs, portfolio_cost_30mw)
    fixed_fee_40mw = calculate_fixed_fee(site_fixed_costs, portfolio_cost_40mw)
    
    # Calculate fee per kWp for each tier
    fee_per_kwp_20mw = calculate_fee_per_kwp(fixed_fee_20mw, system_size, is_contracted)
    fee_per_kwp_30mw = calculate_fee_per_kwp(fixed_fee_30mw, system_size, is_contracted)
    fee_per_kwp_40mw = calculate_fee_per_kwp(fixed_fee_40mw, system_size, is_contracted)
    
    # Monthly fee based on <20MW tier (default)
    monthly_fee = calculate_monthly_fee(fixed_fee_20mw) if is_contracted else 0
    
    # Return site with calculations
    return {
        **site,
        'site_fixed_costs': site_fixed_costs,
        'portfolio_cost_20mw': portfolio_cost_20mw,
        'portfolio_cost_30mw': portfolio_cost_30mw,
        'portfolio_cost_40mw': portfolio_cost_40mw,
        'fixed_fee_20mw': fixed_fee_20mw,
        'fixed_fee_30mw': fixed_fee_30mw,
        'fixed_fee_40mw': fixed_fee_40mw,
        'fee_per_kwp_20mw': fee_per_kwp_20mw,
        'fee_per_kwp_30mw': fee_per_kwp_30mw,
        'fee_per_kwp_40mw': fee_per_kwp_40mw,
        'monthly_fee': monthly_fee,
    }


def calculate_portfolio_summary(sites: list[dict]) -> dict:
    """
    Calculate portfolio-level summary statistics.
    """
    contracted_sites = [s for s in sites if s.get('contract_status') == 'Yes']
    
    total_capacity_kwp = sum(s.get('system_size_kwp', 0) for s in sites)
    contracted_capacity_kwp = sum(s.get('system_size_kwp', 0) for s in contracted_sites)
    
    # Determine current tier
    current_tier = determine_portfolio_tier(contracted_capacity_kwp / 1000)
    
    # Calculate total monthly fee
    sites_with_calcs = [calculate_site_with_all_tiers(s) for s in contracted_sites]
    total_monthly_fee = sum(s.get('monthly_fee', 0) for s in sites_with_calcs)
    
    # Corrective days calculation
    corrective_days_allowed = calculate_corrective_days(contracted_capacity_kwp)
    
    # Sites by SPV
    sites_by_spv = {}
    for site in sites:
        spv = site.get('spv_code') or 'Unassigned'
        sites_by_spv[spv] = sites_by_spv.get(spv, 0) + 1
    
    return {
        'total_sites': len(sites),
        'contracted_sites': len(contracted_sites),
        'total_capacity_kwp': total_capacity_kwp,
        'contracted_capacity_kwp': contracted_capacity_kwp,
        'current_tier': current_tier.get('tier_name', 'N/A'),
        'total_monthly_fee': total_monthly_fee,
        'corrective_days_allowed': corrective_days_allowed,
        'sites_by_spv': sites_by_spv,
    }


# ============ Formatting Functions ============

def format_currency(value: float) -> str:
    """Format a number as GBP currency."""
    return f"£{value:,.2f}"


def format_number(value: float, decimals: int = 2) -> str:
    """Format a number with specified decimal places."""
    return f"{value:,.{decimals}f}"
