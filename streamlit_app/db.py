"""
Database layer for Clearsol O&M Portfolio Tracker.
SQLite database operations for sites, SPVs, rate tiers, CM days usage and
the audit log.

Every write goes through validation (see ``validation.py``) and is recorded
in ``audit_log`` inside the same transaction, so the database never holds a
change that is not traceable.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator, Optional

import validation
from validation import ValidationError

# Database path - overridable so tests/deployments can point elsewhere.
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clearsol_portfolio.db')
DB_PATH = os.environ.get('CLEARSOL_DB_PATH', DEFAULT_DB_PATH)

DEFAULT_SPVS = [
    ('1', 'OS2', 'Olympus Solar 2 Ltd'),
    ('2', 'AD1', 'AMPYR Distributed Energy 1 Ltd'),
    ('3', 'FS', 'Fylde Solar Ltd'),
    ('4', 'ESI8', 'Eden Sustainable Investments 8 Ltd'),
    ('5', 'ESI1', 'Eden Sustainable Investments 1 Ltd'),
    ('6', 'ESI10', 'Eden Sustainable Investments 10 Ltd'),
    ('7', 'UV1', 'ULTRAVOLT SPV1 LIMITED'),
    ('8', 'SKY', 'Skylight Energy Ltd'),
]

DEFAULT_RATE_TIERS = [
    ('1', '<20MW', 0, 20, 2.0),
    ('2', '20-30MW', 20, 30, 1.8),
    ('3', '30-40MW', 30, 40, 1.7),
]

SITE_FIELDS = (
    'name', 'system_size_kwp', 'site_type', 'contract_status', 'onboard_date',
    'pm_cost', 'cctv_cost', 'cleaning_cost', 'spv_id', 'spv_code',
    'source_sheet', 'source_row',
)


def _now() -> str:
    return datetime.now().isoformat(timespec='seconds')


def generate_id() -> str:
    """Generate a unique ID for records."""
    return uuid.uuid4().hex[:16]


@contextmanager
def get_db_connection() -> Iterator[sqlite3.Connection]:
    """Context manager for database connections (commits on success, rolls back on error)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def configure(db_path: str) -> None:
    """Point the module at a different database file and initialise it."""
    global DB_PATH
    DB_PATH = db_path
    init_database()


# ============ Schema ============

def init_database() -> None:
    """Initialize the SQLite database with required tables, indexes and seed data."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS spvs (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rate_tiers (
                id TEXT PRIMARY KEY,
                tier_name TEXT NOT NULL,
                min_capacity_mw REAL NOT NULL,
                max_capacity_mw REAL,
                rate_per_kwp REAL NOT NULL CHECK (rate_per_kwp > 0)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL CHECK (length(trim(name)) > 0),
                system_size_kwp REAL NOT NULL CHECK (system_size_kwp >= 0),
                site_type TEXT NOT NULL DEFAULT 'Rooftop' CHECK (site_type IN ('Rooftop', 'Ground Mount')),
                contract_status TEXT NOT NULL DEFAULT 'No' CHECK (contract_status IN ('Yes', 'No')),
                onboard_date TEXT,
                pm_cost REAL NOT NULL DEFAULT 0 CHECK (pm_cost >= 0),
                cctv_cost REAL NOT NULL DEFAULT 0 CHECK (cctv_cost >= 0),
                cleaning_cost REAL NOT NULL DEFAULT 0 CHECK (cleaning_cost >= 0),
                spv_id TEXT,
                spv_code TEXT,
                source_sheet TEXT,
                source_row INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (spv_id) REFERENCES spvs (id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sites_name ON sites (name COLLATE NOCASE)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sites_spv_code ON sites (spv_code)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sites_contract ON sites (contract_status)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cm_days_usage (
                id TEXT PRIMARY KEY,
                year_month TEXT UNIQUE NOT NULL,
                days_used REAL NOT NULL DEFAULT 0 CHECK (days_used >= 0),
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL,
                old_values TEXT,
                new_values TEXT,
                timestamp TEXT NOT NULL
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log (table_name, record_id)')

        cursor.execute('SELECT COUNT(*) FROM spvs')
        if cursor.fetchone()[0] == 0:
            cursor.executemany('INSERT INTO spvs (id, code, name) VALUES (?, ?, ?)', DEFAULT_SPVS)

        cursor.execute('SELECT COUNT(*) FROM rate_tiers')
        if cursor.fetchone()[0] == 0:
            cursor.executemany(
                'INSERT INTO rate_tiers (id, tier_name, min_capacity_mw, max_capacity_mw, rate_per_kwp) '
                'VALUES (?, ?, ?, ?, ?)',
                DEFAULT_RATE_TIERS,
            )


# ============ Audit log ============

def _json(value: Any) -> Optional[str]:
    return None if value is None else json.dumps(value, default=str, sort_keys=True)


def _write_audit(
    conn: sqlite3.Connection,
    table_name: str,
    record_id: str,
    action: str,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> None:
    conn.execute(
        'INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, timestamp) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        (table_name, record_id, action, _json(old_values), _json(new_values), _now()),
    )


def get_audit_log(
    limit: int = 500,
    table_name: Optional[str] = None,
    record_id: Optional[str] = None,
    action: Optional[str] = None,
) -> list[dict]:
    """Most recent audit entries first, with old/new values decoded."""
    clauses, params = [], []
    if table_name:
        clauses.append('table_name = ?')
        params.append(table_name)
    if record_id:
        clauses.append('record_id = ?')
        params.append(record_id)
    if action:
        clauses.append('action = ?')
        params.append(action)
    where = f'WHERE {" AND ".join(clauses)}' if clauses else ''
    params.append(limit)
    with get_db_connection() as conn:
        rows = conn.execute(
            f'SELECT * FROM audit_log {where} ORDER BY id DESC LIMIT ?', params
        ).fetchall()
    entries = []
    for row in rows:
        entry = dict(row)
        entry['old_values'] = json.loads(entry['old_values']) if entry['old_values'] else None
        entry['new_values'] = json.loads(entry['new_values']) if entry['new_values'] else None
        entries.append(entry)
    return entries


def count_audit_entries() -> int:
    with get_db_connection() as conn:
        return conn.execute('SELECT COUNT(*) FROM audit_log').fetchone()[0]


# ============ SPV Operations ============

def get_spvs() -> list[dict]:
    """Get all SPVs."""
    with get_db_connection() as conn:
        return [dict(row) for row in conn.execute('SELECT * FROM spvs ORDER BY code').fetchall()]


def get_spvs_by_code() -> dict[str, dict]:
    """SPVs keyed by upper-case code — the lookup used for validation."""
    return {spv['code'].upper(): spv for spv in get_spvs()}


def get_spv_by_code(code: str) -> Optional[dict]:
    """Get an SPV by its code (case-insensitive)."""
    if not code:
        return None
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM spvs WHERE upper(code) = upper(?)', (code.strip(),)).fetchone()
        return dict(row) if row else None


def get_spv_by_id(spv_id: str) -> Optional[dict]:
    """Get an SPV by its ID."""
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM spvs WHERE id = ?', (spv_id,)).fetchone()
        return dict(row) if row else None


# ============ Rate Tier Operations ============

def get_rate_tiers() -> list[dict]:
    """Get all rate tiers ordered by capacity band."""
    with get_db_connection() as conn:
        return [dict(row) for row in conn.execute(
            'SELECT * FROM rate_tiers ORDER BY min_capacity_mw'
        ).fetchall()]


def update_rate_tier(tier_id: str, rate_per_kwp: float) -> bool:
    """Update a rate tier's rate per kWp. Validates and audits the change."""
    rate = validation.validate_rate(rate_per_kwp)
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM rate_tiers WHERE id = ?', (tier_id,)).fetchone()
        if not row:
            return False
        old = dict(row)
        if abs(old['rate_per_kwp'] - rate) < 1e-9:
            return True
        conn.execute('UPDATE rate_tiers SET rate_per_kwp = ? WHERE id = ?', (rate, tier_id))
        _write_audit(
            conn, 'rate_tiers', tier_id, 'update',
            {'tier_name': old['tier_name'], 'rate_per_kwp': old['rate_per_kwp']},
            {'tier_name': old['tier_name'], 'rate_per_kwp': rate},
        )
    return True


# ============ Site Operations ============

def get_sites() -> list[dict]:
    """Get all sites, ordered by name (case-insensitive)."""
    with get_db_connection() as conn:
        return [dict(row) for row in conn.execute(
            'SELECT * FROM sites ORDER BY name COLLATE NOCASE'
        ).fetchall()]


def get_site_by_id(site_id: str) -> Optional[dict]:
    """Get a site by its ID."""
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM sites WHERE id = ?', (site_id,)).fetchone()
        return dict(row) if row else None


def find_sites_by_name(name: str, exclude_id: Optional[str] = None) -> list[dict]:
    """Case-insensitive exact-name lookup, used for duplicate detection."""
    clean = validation.clean_text(name)
    if not clean:
        return []
    with get_db_connection() as conn:
        if exclude_id:
            rows = conn.execute(
                'SELECT * FROM sites WHERE name = ? COLLATE NOCASE AND id != ?', (clean, exclude_id)
            ).fetchall()
        else:
            rows = conn.execute('SELECT * FROM sites WHERE name = ? COLLATE NOCASE', (clean,)).fetchall()
        return [dict(r) for r in rows]


def _insert_site(conn: sqlite3.Connection, clean: dict, now: str) -> str:
    site_id = generate_id()
    conn.execute(
        '''INSERT INTO sites (
               id, name, system_size_kwp, site_type, contract_status,
               onboard_date, pm_cost, cctv_cost, cleaning_cost,
               spv_id, spv_code, source_sheet, source_row,
               created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            site_id, clean['name'], clean['system_size_kwp'], clean['site_type'],
            clean['contract_status'], clean['onboard_date'], clean['pm_cost'],
            clean['cctv_cost'], clean['cleaning_cost'], clean['spv_id'], clean['spv_code'],
            clean['source_sheet'], clean['source_row'], now, now,
        ),
    )
    return site_id


def create_site(**data) -> dict:
    """
    Create a new site. Accepts the fields in ``SITE_FIELDS``.
    Raises ``ValidationError`` when the record is invalid.
    """
    clean, errors, _warnings = validation.normalise_site(data, get_spvs_by_code())
    if errors:
        raise ValidationError(errors)
    now = _now()
    with get_db_connection() as conn:
        site_id = _insert_site(conn, clean, now)
        _write_audit(conn, 'sites', site_id, 'create', None, {**clean, 'id': site_id})
    return get_site_by_id(site_id)


def update_site(site_id: str, **kwargs) -> Optional[dict]:
    """
    Update a site. Merges the supplied fields over the existing record,
    re-validates the whole record and records only the changed fields.
    """
    site = get_site_by_id(site_id)
    if not site:
        return None

    merged = {field: site.get(field) for field in SITE_FIELDS}
    for field, value in kwargs.items():
        if field in SITE_FIELDS:
            merged[field] = value

    clean, errors, _warnings = validation.normalise_site(merged, get_spvs_by_code())
    if errors:
        raise ValidationError(errors)

    changed = {f: clean[f] for f in SITE_FIELDS if clean[f] != site.get(f)}
    if not changed:
        return site

    assignments = ', '.join(f'{f} = ?' for f in changed)
    values = list(changed.values()) + [_now(), site_id]
    with get_db_connection() as conn:
        conn.execute(f'UPDATE sites SET {assignments}, updated_at = ? WHERE id = ?', values)
        _write_audit(
            conn, 'sites', site_id, 'update',
            {f: site.get(f) for f in changed}, changed,
        )
    return get_site_by_id(site_id)


def delete_site(site_id: str) -> bool:
    """Delete a site, recording its last known values in the audit log."""
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM sites WHERE id = ?', (site_id,)).fetchone()
        if not row:
            return False
        conn.execute('DELETE FROM sites WHERE id = ?', (site_id,))
        _write_audit(conn, 'sites', site_id, 'delete', dict(row), None)
        return True


def delete_all_sites() -> int:
    """Delete all sites. Returns count of deleted sites."""
    with get_db_connection() as conn:
        count = conn.execute('SELECT COUNT(*) FROM sites').fetchone()[0]
        conn.execute('DELETE FROM sites')
        _write_audit(conn, 'sites', '*', 'delete_all', {'count': count}, None)
        return count


def import_sites(sites_data: list[dict], replace: bool = True) -> list[dict]:
    """
    Bulk import sites atomically. Either every row is written or none are.

    Records are validated first; any invalid row aborts the import with a
    ``ValidationError`` listing the offending rows, and the existing data is
    left untouched. When ``replace`` is True the existing sites are removed
    in the same transaction.
    """
    spvs = get_spvs_by_code()
    cleaned: list[dict] = []
    errors: list[str] = []
    for index, raw in enumerate(sites_data, start=1):
        clean, row_errors, _warnings = validation.normalise_site(raw, spvs)
        if row_errors:
            label = raw.get('name') or f'row {raw.get("source_row") or index}'
            errors.append(f'{label}: {"; ".join(row_errors)}')
        cleaned.append(clean)
    if errors:
        raise ValidationError(errors)

    now = _now()
    ids: list[str] = []
    with get_db_connection() as conn:
        previous = 0
        if replace:
            previous = conn.execute('SELECT COUNT(*) FROM sites').fetchone()[0]
            conn.execute('DELETE FROM sites')
        for clean in cleaned:
            ids.append(_insert_site(conn, clean, now))
        _write_audit(
            conn, 'sites', '*', 'import',
            {'sites_replaced': previous} if replace else None,
            {'sites_imported': len(ids), 'source': cleaned[0]['source_sheet'] if cleaned else None},
        )

    with get_db_connection() as conn:
        placeholders = ','.join('?' for _ in ids)
        rows = conn.execute(
            f'SELECT * FROM sites WHERE id IN ({placeholders}) ORDER BY name COLLATE NOCASE', ids
        ).fetchall() if ids else []
    return [dict(r) for r in rows]


def repair_spv_links() -> int:
    """
    Re-derive ``spv_id`` from ``spv_code`` for every site whose link is
    missing or stale. Returns the number of sites fixed.
    """
    spvs = get_spvs_by_code()
    fixed = 0
    with get_db_connection() as conn:
        rows = conn.execute('SELECT id, spv_id, spv_code FROM sites WHERE spv_code IS NOT NULL').fetchall()
        for row in rows:
            code = (row['spv_code'] or '').strip().upper()
            spv = spvs.get(code)
            expected_id = spv['id'] if spv else None
            if code != row['spv_code'] or expected_id != row['spv_id']:
                conn.execute(
                    'UPDATE sites SET spv_code = ?, spv_id = ?, updated_at = ? WHERE id = ?',
                    (code or None, expected_id, _now(), row['id']),
                )
                _write_audit(
                    conn, 'sites', row['id'], 'update',
                    {'spv_code': row['spv_code'], 'spv_id': row['spv_id']},
                    {'spv_code': code or None, 'spv_id': expected_id},
                )
                fixed += 1
    return fixed


# ============ CM Days Usage ============

def get_cm_days_usage() -> list[dict]:
    """All recorded CM days usage rows, oldest month first."""
    with get_db_connection() as conn:
        return [dict(r) for r in conn.execute(
            'SELECT * FROM cm_days_usage ORDER BY year_month'
        ).fetchall()]


def get_cm_days_usage_by_month(year_month: str) -> Optional[dict]:
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM cm_days_usage WHERE year_month = ?', (year_month,)).fetchone()
        return dict(row) if row else None


def upsert_cm_days_usage(year_month: str, days_used: float, notes: Optional[str] = None) -> dict:
    """Create or update the CM days used for a month."""
    year_month = validation.validate_year_month(year_month)
    days = validation.parse_number(days_used, 'Days used')
    days = 0.0 if days is None else round(days, 2)
    if days < 0:
        raise ValidationError(['Days used cannot be negative'])
    notes = validation.clean_text(notes)
    now = _now()

    with get_db_connection() as conn:
        existing = conn.execute(
            'SELECT * FROM cm_days_usage WHERE year_month = ?', (year_month,)
        ).fetchone()
        if existing:
            old = dict(existing)
            if abs(old['days_used'] - days) < 1e-9 and (old['notes'] or None) == notes:
                return old
            conn.execute(
                'UPDATE cm_days_usage SET days_used = ?, notes = ?, updated_at = ? WHERE year_month = ?',
                (days, notes, now, year_month),
            )
            _write_audit(
                conn, 'cm_days_usage', year_month, 'update',
                {'days_used': old['days_used'], 'notes': old['notes']},
                {'days_used': days, 'notes': notes},
            )
        else:
            conn.execute(
                'INSERT INTO cm_days_usage (id, year_month, days_used, notes, created_at, updated_at) '
                'VALUES (?, ?, ?, ?, ?, ?)',
                (generate_id(), year_month, days, notes, now, now),
            )
            _write_audit(
                conn, 'cm_days_usage', year_month, 'create', None,
                {'year_month': year_month, 'days_used': days, 'notes': notes},
            )
    return get_cm_days_usage_by_month(year_month)


def delete_cm_days_usage(year_month: str) -> bool:
    with get_db_connection() as conn:
        row = conn.execute('SELECT * FROM cm_days_usage WHERE year_month = ?', (year_month,)).fetchone()
        if not row:
            return False
        conn.execute('DELETE FROM cm_days_usage WHERE year_month = ?', (year_month,))
        _write_audit(conn, 'cm_days_usage', year_month, 'delete', dict(row), None)
        return True


# Initialize database on module load
init_database()
