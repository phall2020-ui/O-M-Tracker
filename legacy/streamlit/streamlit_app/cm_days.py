"""
Corrective Maintenance (CM) days tracking.

The framework grants 1 CM day per MW of contracted capacity per year,
accrued monthly. This module rebuilds the month-by-month history from the
sites' onboard dates and the manually recorded days used, so the running
balance is always consistent with the current portfolio data.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Optional

import calculations


def calculate_monthly_corrective_days(capacity_mw: float) -> float:
    """CM days accrued in a month for a given contracted capacity (MW)."""
    return round((capacity_mw / 12) * 10) / 10


def get_portfolio_start_date(sites: list[dict]) -> Optional[str]:
    """Earliest onboard date across contracted sites (ISO string) or None."""
    dates = [
        s['onboard_date'][:10]
        for s in sites
        if s.get('contract_status') == 'Yes' and s.get('onboard_date')
    ]
    return min(dates) if dates else None


def get_months_from_start(start_date: str, today: Optional[date] = None) -> list[str]:
    """Every ``YYYY-MM`` from the start month up to and including the current month."""
    today = today or date.today()
    year, month = int(start_date[:4]), int(start_date[5:7])
    months: list[str] = []
    while (year, month) <= (today.year, today.month):
        months.append(f'{year:04d}-{month:02d}')
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def month_end(year_month: str) -> str:
    year, month = int(year_month[:4]), int(year_month[5:7])
    return date(year, month, monthrange(year, month)[1]).isoformat()


def get_contracted_sites_for_month(sites: list[dict], year_month: str) -> list[dict]:
    """Contracted sites onboarded on or before the end of the given month."""
    end = month_end(year_month)
    return [
        s for s in sites
        if s.get('contract_status') == 'Yes' and s.get('onboard_date') and s['onboard_date'][:10] <= end
    ]


def calculate_portfolio_details_for_month(
    sites: list[dict],
    year_month: str,
    tiers: Optional[list[dict]] = None,
) -> dict:
    """Site count, fixed costs, portfolio cost and total for a month's contracted sites."""
    contracted = get_contracted_sites_for_month(sites, year_month)
    fixed_cost = sum(
        calculations.calculate_site_fixed_costs(
            s.get('pm_cost', 0) or 0, s.get('cctv_cost', 0) or 0, s.get('cleaning_cost', 0) or 0
        )
        for s in contracted
    )
    capacity_kwp = sum(s.get('system_size_kwp', 0) or 0 for s in contracted)
    tier = calculations.determine_portfolio_tier(capacity_kwp / 1000, tiers)
    portfolio_cost = capacity_kwp * tier['rate_per_kwp']
    return {
        'number_of_sites': len(contracted),
        'capacity_mw': round(capacity_kwp / 1000, 3),
        'tier_name': tier['tier_name'],
        'fixed_cost': round(fixed_cost, 2),
        'portfolio_cost': round(portfolio_cost, 2),
        'total_fixed_cost': round(fixed_cost + portfolio_cost, 2),
    }


def calculate_cm_days_tracking(
    sites: list[dict],
    cm_days_usage: list[dict],
    tiers: Optional[list[dict]] = None,
    today: Optional[date] = None,
) -> dict:
    """
    Build the month-by-month CM days ledger since portfolio start.

    ``cm_days_usage`` rows need ``year_month`` and ``days_used`` (``notes`` optional).
    """
    start = get_portfolio_start_date(sites)
    empty = {
        'portfolio_start_date': start,
        'monthly_data': [],
        'total_accumulated': 0.0,
        'total_used': 0.0,
        'total_remaining': 0.0,
        'orphan_usage': [],
    }
    if not start:
        empty['orphan_usage'] = list(cm_days_usage)
        return empty

    if tiers is None:
        tiers = calculations.db.get_rate_tiers() or calculations.DEFAULT_RATE_TIERS

    months = get_months_from_start(start, today)
    usage_by_month = {u['year_month']: u for u in cm_days_usage}

    cumulative_accumulated = 0.0
    cumulative_used = 0.0
    monthly_data: list[dict] = []

    for year_month in months:
        details = calculate_portfolio_details_for_month(sites, year_month, tiers)
        days_accumulated = calculate_monthly_corrective_days(details['capacity_mw'])
        usage = usage_by_month.get(year_month)
        days_used = float(usage['days_used']) if usage else 0.0
        cumulative_accumulated += days_accumulated
        cumulative_used += days_used
        monthly_data.append({
            'year_month': year_month,
            'label': format_year_month(year_month),
            'days_accumulated': round(days_accumulated, 1),
            'days_used': round(days_used, 1),
            'days_remaining': round(days_accumulated - days_used, 1),
            'cumulative_accumulated': round(cumulative_accumulated, 1),
            'cumulative_used': round(cumulative_used, 1),
            'cumulative_remaining': round(cumulative_accumulated - cumulative_used, 1),
            'notes': (usage or {}).get('notes') or '',
            **details,
        })

    # Usage recorded for months outside the tracked window is a data-quality issue
    tracked = set(months)
    orphan_usage = [u for u in cm_days_usage if u['year_month'] not in tracked]

    return {
        'portfolio_start_date': start,
        'monthly_data': monthly_data,
        'total_accumulated': round(cumulative_accumulated, 1),
        'total_used': round(cumulative_used, 1),
        'total_remaining': round(cumulative_accumulated - cumulative_used, 1),
        'orphan_usage': orphan_usage,
    }


_MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def format_year_month(year_month: str) -> str:
    """``2024-01`` -> ``Jan 2024``."""
    year, month = int(year_month[:4]), int(year_month[5:7])
    return f'{_MONTHS[month - 1]} {year}'
