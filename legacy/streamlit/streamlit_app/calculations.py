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


def next_tier_progress(total_capacity_mw: float, tiers: Optional[list[dict]] = None) -> dict:
    """
    Describe where the portfolio sits within its current tier band.
    Returns current tier, the next tier (or None at the top band), the MW
    still needed to reach it, and a 0-1 progress fraction through the band.
    """
    if tiers is None:
        tiers = db.get_rate_tiers() or DEFAULT_RATE_TIERS
    ordered = sorted(tiers, key=lambda t: t['min_capacity_mw'])
    current = determine_portfolio_tier(total_capacity_mw, ordered)
    index = next((i for i, t in enumerate(ordered) if t['id'] == current['id']), len(ordered) - 1)
    next_tier = ordered[index + 1] if index + 1 < len(ordered) else None
    lower = current.get('min_capacity_mw') or 0
    upper = current.get('max_capacity_mw')
    if upper is None or upper <= lower:
        progress = 1.0
        mw_to_next = 0.0
    else:
        progress = max(0.0, min(1.0, (total_capacity_mw - lower) / (upper - lower)))
        mw_to_next = max(0.0, upper - total_capacity_mw)
    return {
        'current_tier': current,
        'next_tier': next_tier,
        'mw_to_next_tier': round(mw_to_next, 3),
        'progress': progress,
    }


def calculate_corrective_days(contracted_capacity_kwp: float) -> float:
    """
    Calculate corrective days allowed.
    Corrective Days = Capacity / 1000 / 12
    """
    return round((contracted_capacity_kwp / 1000 / 12) * 10) / 10


# ============ Site Calculation Functions ============

def calculate_site_with_all_tiers(
    site: dict,
    tiers: Optional[list[dict]] = None,
    current_tier_name: Optional[str] = None,
) -> dict:
    """
    Calculate all fee metrics for a site across all tiers.
    Returns the site dict with additional calculated fields.

    ``current_tier_name`` selects which tier the site's applicable fixed fee
    and monthly fee are based on. When omitted the <20MW tier is used, which
    matches the spreadsheet's default column.
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
    
    # Applicable fee follows the portfolio's current tier (defaults to <20MW)
    fixed_fee_by_tier = {
        tier_20mw['tier_name']: (fixed_fee_20mw, fee_per_kwp_20mw),
        tier_30mw['tier_name']: (fixed_fee_30mw, fee_per_kwp_30mw),
        tier_40mw['tier_name']: (fixed_fee_40mw, fee_per_kwp_40mw),
    }
    applicable_tier = current_tier_name if current_tier_name in fixed_fee_by_tier else tier_20mw['tier_name']
    fixed_fee_current, fee_per_kwp_current = fixed_fee_by_tier[applicable_tier]
    monthly_fee = calculate_monthly_fee(fixed_fee_current) if is_contracted else 0
    
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
        'applicable_tier': applicable_tier,
        'fixed_fee_current': fixed_fee_current,
        'fee_per_kwp_current': fee_per_kwp_current,
        'monthly_fee': monthly_fee,
    }


def current_portfolio_tier(sites: list[dict], tiers: Optional[list[dict]] = None) -> dict:
    """The rate tier the portfolio's contracted capacity currently falls in."""
    contracted_kwp = sum(s.get('system_size_kwp', 0) for s in sites if s.get('contract_status') == 'Yes')
    return determine_portfolio_tier(contracted_kwp / 1000, tiers)


def calculate_sites_at_current_tier(
    sites: list[dict],
    tiers: Optional[list[dict]] = None,
) -> tuple[list[dict], dict]:
    """
    Calculate every site with fees based on the portfolio's *actual* tier.
    Returns ``(sites_with_calcs, current_tier)`` so pages show consistent
    numbers with the dashboard.
    """
    if tiers is None:
        tiers = db.get_rate_tiers() or DEFAULT_RATE_TIERS
    tier = current_portfolio_tier(sites, tiers)
    calculated = [calculate_site_with_all_tiers(s, tiers, tier['tier_name']) for s in sites]
    return calculated, tier


def calculate_portfolio_summary(sites: list[dict], tiers: Optional[list[dict]] = None) -> dict:
    """
    Calculate portfolio-level summary statistics.
    """
    if tiers is None:
        tiers = db.get_rate_tiers() or DEFAULT_RATE_TIERS
    contracted_sites = [s for s in sites if s.get('contract_status') == 'Yes']
    
    total_capacity_kwp = sum(s.get('system_size_kwp', 0) for s in sites)
    contracted_capacity_kwp = sum(s.get('system_size_kwp', 0) for s in contracted_sites)
    
    # Determine current tier
    current_tier = determine_portfolio_tier(contracted_capacity_kwp / 1000, tiers)
    
    # Total monthly fee at the tier the portfolio is actually in
    sites_with_calcs = [
        calculate_site_with_all_tiers(s, tiers, current_tier['tier_name']) for s in contracted_sites
    ]
    total_monthly_fee = sum(s.get('monthly_fee', 0) for s in sites_with_calcs)
    total_annual_fee = sum(s.get('fixed_fee_current', 0) for s in sites_with_calcs)
    total_site_fixed_costs = sum(s.get('site_fixed_costs', 0) for s in sites_with_calcs)
    
    # Corrective days calculation
    corrective_days_allowed = calculate_corrective_days(contracted_capacity_kwp)
    
    # Sites by SPV
    sites_by_spv = {}
    capacity_by_spv = {}
    for site in sites:
        spv = site.get('spv_code') or 'Unassigned'
        sites_by_spv[spv] = sites_by_spv.get(spv, 0) + 1
        capacity_by_spv[spv] = capacity_by_spv.get(spv, 0) + (site.get('system_size_kwp') or 0)
    
    return {
        'total_sites': len(sites),
        'contracted_sites': len(contracted_sites),
        'total_capacity_kwp': total_capacity_kwp,
        'contracted_capacity_kwp': contracted_capacity_kwp,
        'current_tier': current_tier.get('tier_name', 'N/A'),
        'current_rate_per_kwp': current_tier.get('rate_per_kwp'),
        'total_monthly_fee': total_monthly_fee,
        'total_annual_fee': total_annual_fee,
        'total_site_fixed_costs': total_site_fixed_costs,
        'corrective_days_allowed': corrective_days_allowed,
        'sites_by_spv': sites_by_spv,
        'capacity_by_spv': capacity_by_spv,
    }


# ============ Formatting Functions ============

def format_currency(value: float) -> str:
    """Format a number as GBP currency."""
    return f"£{value:,.2f}"


def format_number(value: float, decimals: int = 2) -> str:
    """Format a number with specified decimal places."""
    return f"{value:,.{decimals}f}"
