"""
Input normalisation and validation for site records.

Every path that writes a site (forms, Excel import, JSON import, migration)
goes through ``normalise_site`` so the database only ever holds clean,
consistently-typed data.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime
from typing import Any, Optional

CONTRACT_STATUSES = ('Yes', 'No')
SITE_TYPES = ('Rooftop', 'Ground Mount')

_TRUTHY = {'yes', 'y', 'true', '1', 'contracted', 'signed', 'live'}
_FALSY = {'no', 'n', 'false', '0', 'not contracted', 'pending', 'tbc', '', 'none', 'nan', '-', '—'}

_SITE_TYPE_ALIASES = {
    'rooftop': 'Rooftop',
    'roof': 'Rooftop',
    'roof top': 'Rooftop',
    'roof-top': 'Rooftop',
    'ground mount': 'Ground Mount',
    'ground-mount': 'Ground Mount',
    'groundmount': 'Ground Mount',
    'ground': 'Ground Mount',
    'gm': 'Ground Mount',
}

_DATE_FORMATS = (
    '%Y-%m-%d',
    '%Y-%m-%dT%H:%M:%S',
    '%Y-%m-%dT%H:%M:%S.%f',
    '%Y-%m-%d %H:%M:%S',
    '%d/%m/%Y',
    '%d/%m/%y',
    '%d-%m-%Y',
    '%d.%m.%Y',
    '%d %b %Y',
    '%d %B %Y',
    '%b %Y',
    '%B %Y',
    '%Y-%m',
    '%m/%Y',
)


class ValidationError(ValueError):
    """Raised when a record fails validation. ``errors`` lists every problem."""

    def __init__(self, errors: list[str]):
        self.errors = list(errors)
        super().__init__('; '.join(self.errors))


# ============ Primitive parsers ============

def is_blank(value: Any) -> bool:
    """True for None, NaN, and empty/whitespace-only strings."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def clean_text(value: Any) -> Optional[str]:
    """Strip and collapse internal whitespace. Returns None when blank."""
    if is_blank(value):
        return None
    text = str(value).strip()
    text = re.sub(r'\s+', ' ', text)
    return text or None


def parse_number(value: Any, field: str = 'value') -> Optional[float]:
    """
    Parse a numeric value from spreadsheets/forms.
    Accepts ints, floats and strings such as "£1,250.00" or "1 250".
    Returns None for blank input and raises ValueError for garbage.
    """
    if is_blank(value):
        return None
    if isinstance(value, bool):
        raise ValueError(f'{field}: expected a number, got a boolean')
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            raise ValueError(f'{field}: expected a number, got {value}')
        return float(value)

    text = str(value).strip()
    text = re.sub(r'[£$€,\s]', '', text)
    if text.startswith('(') and text.endswith(')'):
        text = '-' + text[1:-1]
    try:
        return float(text)
    except ValueError:
        raise ValueError(f'{field}: "{value}" is not a number') from None


def parse_contract_status(value: Any) -> tuple[str, Optional[str]]:
    """
    Normalise a contract flag to 'Yes'/'No'.
    Returns (status, warning). Unknown values default to 'No' with a warning
    rather than silently being treated as contracted.
    """
    if isinstance(value, bool):
        return ('Yes' if value else 'No'), None
    if isinstance(value, (int, float)) and not (isinstance(value, float) and math.isnan(value)):
        return ('Yes' if value else 'No'), None
    text = '' if is_blank(value) else str(value).strip().lower()
    if text in _TRUTHY:
        return 'Yes', None
    if text in _FALSY:
        return 'No', None
    return 'No', f'Unrecognised contract status "{value}" — treated as "No"'


def parse_site_type(value: Any) -> tuple[str, Optional[str]]:
    """Normalise a site type. Unknown values default to 'Rooftop' with a warning."""
    if is_blank(value):
        return 'Rooftop', None
    text = str(value).strip().lower()
    if text in _SITE_TYPE_ALIASES:
        return _SITE_TYPE_ALIASES[text], None
    return 'Rooftop', f'Unrecognised site type "{value}" — treated as "Rooftop"'


def parse_date(value: Any, field: str = 'date') -> Optional[str]:
    """
    Normalise a date to ISO ``YYYY-MM-DD``.
    Accepts date/datetime objects, pandas Timestamps, Excel serials and
    common UK string formats. Returns None for blank input.
    """
    if is_blank(value):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    # pandas.Timestamp quacks like datetime but avoid importing pandas here
    if hasattr(value, 'to_pydatetime'):
        try:
            return value.to_pydatetime().date().isoformat()
        except Exception:  # pragma: no cover - defensive
            pass
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # Excel serial date (days since 1899-12-30)
        if 20000 <= value <= 80000:
            base = date(1899, 12, 30)
            return date.fromordinal(base.toordinal() + int(value)).isoformat()
        raise ValueError(f'{field}: {value} is not a recognisable date')

    text = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f'{field}: "{value}" is not a recognisable date (use DD/MM/YYYY)')


def normalise_spv_code(value: Any) -> Optional[str]:
    """Upper-case, trimmed SPV code or None."""
    text = clean_text(value)
    return text.upper() if text else None


# ============ Site record ============

def normalise_site(
    data: dict,
    spvs_by_code: Optional[dict[str, dict]] = None,
    *,
    require_positive_size: bool = False,
) -> tuple[dict, list[str], list[str]]:
    """
    Clean and validate a site record.

    Returns ``(clean, errors, warnings)``. ``clean`` is only safe to persist
    when ``errors`` is empty. ``spvs_by_code`` maps SPV code -> SPV row and is
    used to resolve ``spv_id`` consistently from ``spv_code``.
    """
    spvs_by_code = spvs_by_code or {}
    errors: list[str] = []
    warnings: list[str] = []

    name = clean_text(data.get('name'))
    if not name:
        errors.append('Site name is required')

    try:
        size = parse_number(data.get('system_size_kwp'), 'System size (kWp)')
    except ValueError as exc:
        errors.append(str(exc))
        size = None
    if size is None:
        size = 0.0
    if size < 0:
        errors.append('System size (kWp) cannot be negative')
    elif size == 0:
        if require_positive_size:
            errors.append('System size (kWp) must be greater than zero')
        else:
            warnings.append('System size is 0 kWp — fees for this site will be zero')
    elif size > 100_000:
        warnings.append(f'System size {size:,.0f} kWp looks unusually large — check units (kWp, not Wp)')

    site_type, warn = parse_site_type(data.get('site_type'))
    if warn:
        warnings.append(warn)

    contract_status, warn = parse_contract_status(data.get('contract_status'))
    if warn:
        warnings.append(warn)

    try:
        onboard_date = parse_date(data.get('onboard_date'), 'Onboard date')
    except ValueError as exc:
        errors.append(str(exc))
        onboard_date = None
    if contract_status == 'Yes' and not onboard_date:
        warnings.append('Contracted site has no onboard date — it will be excluded from CM Days tracking')
    if onboard_date and onboard_date > date.today().isoformat():
        warnings.append(f'Onboard date {onboard_date} is in the future')

    costs: dict[str, float] = {}
    for field, label in (('pm_cost', 'PM cost'), ('cctv_cost', 'CCTV cost'), ('cleaning_cost', 'Cleaning cost')):
        try:
            amount = parse_number(data.get(field), label)
        except ValueError as exc:
            errors.append(str(exc))
            amount = None
        amount = 0.0 if amount is None else amount
        if amount < 0:
            errors.append(f'{label} cannot be negative')
        costs[field] = round(amount, 2)

    if contract_status == 'Yes' and size > 0 and sum(costs.values()) == 0:
        warnings.append('Contracted site has no fixed costs (PM, CCTV, Cleaning all £0)')

    spv_code = normalise_spv_code(data.get('spv_code'))
    spv_id = None
    if spv_code:
        spv = spvs_by_code.get(spv_code)
        if spv:
            spv_id = spv['id']
        else:
            warnings.append(f'SPV code "{spv_code}" is not a known SPV — site kept but unlinked')
    else:
        warnings.append('No SPV assigned')

    source_row = data.get('source_row')
    if is_blank(source_row):
        source_row = None
    else:
        try:
            source_row = int(source_row)
        except (TypeError, ValueError):
            source_row = None

    clean = {
        'name': name or '',
        'system_size_kwp': round(size, 4),
        'site_type': site_type,
        'contract_status': contract_status,
        'onboard_date': onboard_date,
        'pm_cost': costs['pm_cost'],
        'cctv_cost': costs['cctv_cost'],
        'cleaning_cost': costs['cleaning_cost'],
        'spv_id': spv_id,
        'spv_code': spv_code,
        'source_sheet': clean_text(data.get('source_sheet')),
        'source_row': source_row,
    }
    return clean, errors, warnings


def validate_rate(value: Any) -> float:
    """Validate a £/kWp rate. Raises ValidationError."""
    try:
        rate = parse_number(value, 'Rate')
    except ValueError as exc:
        raise ValidationError([str(exc)]) from None
    if rate is None:
        raise ValidationError(['Rate is required'])
    if rate <= 0:
        raise ValidationError(['Rate must be greater than £0.00/kWp'])
    if rate > 100:
        raise ValidationError(['Rate above £100/kWp is not plausible — check the value'])
    return round(rate, 4)


def validate_year_month(value: Any) -> str:
    """Validate a ``YYYY-MM`` string."""
    text = clean_text(value) or ''
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', text):
        raise ValidationError([f'"{value}" is not a valid month (expected YYYY-MM)'])
    return text
