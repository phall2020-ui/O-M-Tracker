"""
Spreadsheet / JSON import parsing.

Parsing is separated from persistence so the UI can show a full preview —
including every warning and error, per row — before anything is written.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import pandas as pd

import validation

SHEET_NAME = 'Portfolio Tracker'
FIRST_DATA_ROW = 5  # Excel row number; rows 1-4 are headers

# Zero-based column indexes in the "Portfolio Tracker" sheet
COLUMNS = {
    'name': 2,             # C
    'system_size_kwp': 3,  # D
    'contract_status': 4,  # E
    'onboard_date': 5,     # F
    'pm_cost': 6,          # G
    'cctv_cost': 7,        # H
    'cleaning_cost': 8,    # I
    'spv_code': 21,        # V
}

# Rows whose name cell is one of these are footer/summary rows, not sites
_SUMMARY_LABELS = {'total', 'totals', 'sum', 'subtotal', 'grand total', 'portfolio total'}

# Stop scanning after this many consecutive empty rows below the data block
_BLANK_ROW_LIMIT = 10

_JSON_KEY_ALIASES = {
    'name': ('name', 'site_name', 'siteName', 'Site Name'),
    'system_size_kwp': ('system_size_kwp', 'systemSizeKwp', 'size_kwp', 'kWp'),
    'site_type': ('site_type', 'siteType'),
    'contract_status': ('contract_status', 'contractStatus', 'contracted'),
    'onboard_date': ('onboard_date', 'onboardDate'),
    'pm_cost': ('pm_cost', 'pmCost'),
    'cctv_cost': ('cctv_cost', 'cctvCost'),
    'cleaning_cost': ('cleaning_cost', 'cleaningCost'),
    'spv_code': ('spv_code', 'spvCode', 'spv'),
    'source_sheet': ('source_sheet', 'sourceSheet'),
    'source_row': ('source_row', 'sourceRow'),
}


@dataclass
class ImportRow:
    source_row: int
    raw: dict[str, Any]
    clean: Optional[dict] = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors and self.clean is not None

    @property
    def status(self) -> str:
        if self.errors:
            return 'Error'
        return 'Warning' if self.warnings else 'OK'


@dataclass
class ImportResult:
    rows: list[ImportRow] = field(default_factory=list)
    skipped_rows: list[tuple[int, str]] = field(default_factory=list)
    file_errors: list[str] = field(default_factory=list)

    @property
    def valid_sites(self) -> list[dict]:
        return [r.clean for r in self.rows if r.is_valid]

    @property
    def error_rows(self) -> list[ImportRow]:
        return [r for r in self.rows if r.errors]

    @property
    def warning_rows(self) -> list[ImportRow]:
        return [r for r in self.rows if r.warnings and not r.errors]

    @property
    def total_errors(self) -> int:
        return sum(len(r.errors) for r in self.rows) + len(self.file_errors)

    @property
    def total_warnings(self) -> int:
        return sum(len(r.warnings) for r in self.rows)

    def summary(self) -> dict:
        valid = self.valid_sites
        return {
            'rows_found': len(self.rows),
            'valid': len(valid),
            'with_errors': len(self.error_rows),
            'with_warnings': len(self.warning_rows),
            'skipped': len(self.skipped_rows),
            'contracted': sum(1 for s in valid if s['contract_status'] == 'Yes'),
            'total_capacity_kwp': sum(s['system_size_kwp'] for s in valid),
        }

    def preview_frame(self) -> pd.DataFrame:
        """Tabular view of every parsed row with its validation status."""
        records = []
        for row in self.rows:
            clean = row.clean or {}
            records.append({
                'Row': row.source_row,
                'Status': row.status,
                'Site Name': clean.get('name') or row.raw.get('name'),
                'Size (kWp)': clean.get('system_size_kwp'),
                'Contract': clean.get('contract_status'),
                'Onboard Date': clean.get('onboard_date'),
                'SPV': clean.get('spv_code'),
                'PM Cost': clean.get('pm_cost'),
                'CCTV Cost': clean.get('cctv_cost'),
                'Cleaning Cost': clean.get('cleaning_cost'),
                'Issues': ' | '.join(row.errors + row.warnings),
            })
        return pd.DataFrame(records)


def _cell(row: pd.Series, index: int) -> Any:
    return row.iloc[index] if len(row) > index else None


def _flag_duplicates(rows: list[ImportRow]) -> None:
    seen: dict[str, list[ImportRow]] = {}
    for row in rows:
        if row.clean and row.clean.get('name'):
            seen.setdefault(row.clean['name'].lower(), []).append(row)
    for group in seen.values():
        if len(group) > 1:
            numbers = ', '.join(str(r.source_row) for r in group)
            for row in group:
                row.warnings.append(f'Duplicate site name (also on rows {numbers})')


def parse_portfolio_tracker(
    df: pd.DataFrame,
    spvs_by_code: dict[str, dict],
    first_row: int = FIRST_DATA_ROW,
    last_row: Optional[int] = None,
) -> ImportResult:
    """
    Parse the "Portfolio Tracker" sheet loaded with ``header=None``.

    Scans from ``first_row`` (1-based Excel row) until ``last_row`` or until
    a run of blank rows ends the data block, so sites added below the
    original template range are picked up.
    """
    result = ImportResult()
    start_index = max(first_row - 1, 0)
    end_index = min(last_row, len(df)) if last_row else len(df)
    blank_run = 0

    for index in range(start_index, end_index):
        row = df.iloc[index]
        excel_row = index + 1
        raw_name = _cell(row, COLUMNS['name'])
        name = validation.clean_text(raw_name)

        if not name:
            blank_run += 1
            if last_row is None and blank_run >= _BLANK_ROW_LIMIT:
                break
            continue
        blank_run = 0

        if name.lower() in _SUMMARY_LABELS:
            result.skipped_rows.append((excel_row, f'"{name}" looks like a summary row'))
            continue
        if not isinstance(raw_name, str):
            result.skipped_rows.append((excel_row, f'Site name cell contains {type(raw_name).__name__} "{raw_name}"'))
            continue

        raw = {key: _cell(row, col) for key, col in COLUMNS.items()}
        raw['site_type'] = 'Rooftop'
        raw['source_sheet'] = SHEET_NAME
        raw['source_row'] = excel_row

        clean, errors, warnings = validation.normalise_site(raw, spvs_by_code)
        result.rows.append(ImportRow(
            source_row=excel_row,
            raw=raw,
            clean=clean if not errors else None,
            errors=errors,
            warnings=warnings,
        ))

    _flag_duplicates(result.rows)
    return result


def parse_workbook(file, spvs_by_code: dict[str, dict], **kwargs) -> ImportResult:
    """Open an uploaded workbook and parse the Portfolio Tracker sheet."""
    try:
        if hasattr(file, 'seek'):
            file.seek(0)
        workbook = pd.ExcelFile(file)
    except Exception as exc:  # pragma: no cover - depends on file contents
        result = ImportResult()
        result.file_errors.append(f'Could not open workbook: {exc}')
        return result

    if SHEET_NAME not in workbook.sheet_names:
        result = ImportResult()
        result.file_errors.append(
            f'Sheet "{SHEET_NAME}" not found. Available sheets: {", ".join(workbook.sheet_names)}'
        )
        return result

    df = pd.read_excel(workbook, sheet_name=SHEET_NAME, header=None)
    return parse_portfolio_tracker(df, spvs_by_code, **kwargs)


def _pick(item: dict, key: str) -> Any:
    for alias in _JSON_KEY_ALIASES[key]:
        if alias in item:
            return item[alias]
    return None


def parse_json_sites(items: Any, spvs_by_code: dict[str, dict]) -> ImportResult:
    """Parse a JSON export (camelCase or snake_case keys) into validated rows."""
    result = ImportResult()
    if not isinstance(items, list):
        result.file_errors.append('JSON file must contain an array of site objects')
        return result

    for position, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            result.skipped_rows.append((position, 'Entry is not an object'))
            continue
        raw = {key: _pick(item, key) for key in _JSON_KEY_ALIASES}
        if raw.get('source_row') is None:
            raw['source_row'] = position
        if raw.get('source_sheet') is None:
            raw['source_sheet'] = 'JSON import'
        clean, errors, warnings = validation.normalise_site(raw, spvs_by_code)
        result.rows.append(ImportRow(
            source_row=position,
            raw=raw,
            clean=clean if not errors else None,
            errors=errors,
            warnings=warnings,
        ))

    _flag_duplicates(result.rows)
    return result
