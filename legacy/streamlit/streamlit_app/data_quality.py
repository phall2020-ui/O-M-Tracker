"""
Portfolio data-quality checks.

Runs a set of rules over the stored sites and returns a flat list of issues
that the dashboard, sites page and SPV page surface to the user.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

SEVERITY_ORDER = {'error': 0, 'warning': 1, 'info': 2}


def _issue(severity: str, code: str, message: str, site: Optional[dict] = None, fixable: bool = False) -> dict:
    return {
        'severity': severity,
        'code': code,
        'site_id': site.get('id') if site else None,
        'site_name': site.get('name') if site else None,
        'message': message,
        'fixable': fixable,
    }


def check_sites(sites: list[dict], spvs: list[dict], today: Optional[date] = None) -> list[dict]:
    """Return every data-quality issue found, most severe first."""
    today = today or date.today()
    known_codes = {spv['code'].upper(): spv for spv in spvs}
    issues: list[dict] = []

    names: dict[str, list[dict]] = {}
    for site in sites:
        key = (site.get('name') or '').strip().lower()
        if key:
            names.setdefault(key, []).append(site)

    for site in sites:
        size = site.get('system_size_kwp') or 0
        contracted = site.get('contract_status') == 'Yes'
        code = site.get('spv_code')
        onboard = site.get('onboard_date')

        if size <= 0:
            issues.append(_issue('error', 'zero_size', 'System size is 0 kWp — fees cannot be calculated', site))

        if code:
            upper = code.strip().upper()
            spv = known_codes.get(upper)
            if not spv:
                issues.append(_issue(
                    'error', 'unknown_spv', f'SPV code "{code}" does not match any configured SPV', site
                ))
            elif site.get('spv_id') != spv['id'] or code != upper:
                issues.append(_issue(
                    'warning', 'spv_link', f'SPV link out of sync for code "{code}" (auto-fixable)', site, fixable=True
                ))
        else:
            issues.append(_issue('warning', 'no_spv', 'No SPV assigned', site))

        if contracted and not onboard:
            issues.append(_issue(
                'warning', 'no_onboard_date',
                'Contracted site has no onboard date — excluded from CM Days tracking', site,
            ))
        if onboard and onboard[:10] > today.isoformat():
            issues.append(_issue('warning', 'future_onboard', f'Onboard date {onboard[:10]} is in the future', site))
        if not contracted and onboard:
            issues.append(_issue('info', 'date_not_contracted', 'Has an onboard date but is not marked as contracted', site))

        costs = (site.get('pm_cost') or 0) + (site.get('cctv_cost') or 0) + (site.get('cleaning_cost') or 0)
        if contracted and size > 0 and costs == 0:
            issues.append(_issue('info', 'zero_costs', 'Contracted site has £0 fixed costs (PM, CCTV, Cleaning)', site))

        if size > 100_000:
            issues.append(_issue('warning', 'large_size', f'System size {size:,.0f} kWp looks unusually large', site))

    for group in names.values():
        if len(group) > 1:
            for site in group:
                issues.append(_issue(
                    'warning', 'duplicate_name', f'Site name appears {len(group)} times', site
                ))

    issues.sort(key=lambda i: (SEVERITY_ORDER.get(i['severity'], 9), i['site_name'] or ''))
    return issues


def summarise(issues: list[dict]) -> dict:
    counts = {'error': 0, 'warning': 0, 'info': 0}
    for issue in issues:
        counts[issue['severity']] = counts.get(issue['severity'], 0) + 1
    counts['total'] = len(issues)
    counts['fixable'] = sum(1 for i in issues if i['fixable'])
    counts['sites_affected'] = len({i['site_id'] for i in issues if i['site_id']})
    return counts


def issues_frame(issues: list[dict]) -> pd.DataFrame:
    if not issues:
        return pd.DataFrame(columns=['Severity', 'Site', 'Issue'])
    return pd.DataFrame([
        {
            'Severity': issue['severity'].title(),
            'Site': issue['site_name'] or '—',
            'Issue': issue['message'],
        }
        for issue in issues
    ])


def issues_for_site(issues: list[dict], site_id: str) -> list[dict]:
    return [i for i in issues if i['site_id'] == site_id]
