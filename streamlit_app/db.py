"""
Database layer for Clearsol O&M Portfolio Tracker.
SQLite database operations for sites, SPVs, and rate tiers.
"""

import sqlite3
import os
from datetime import datetime
from typing import Optional
from contextlib import contextmanager

# Database path - relative to the streamlit_app directory
DB_PATH = os.path.join(os.path.dirname(__file__), 'clearsol_portfolio.db')


@contextmanager
def get_db_connection():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_database():
    """Initialize the SQLite database with required tables."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Create SPVs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS spvs (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL
            )
        ''')
        
        # Create rate_tiers table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rate_tiers (
                id TEXT PRIMARY KEY,
                tier_name TEXT NOT NULL,
                min_capacity_mw REAL NOT NULL,
                max_capacity_mw REAL,
                rate_per_kwp REAL NOT NULL
            )
        ''')
        
        # Create sites table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                system_size_kwp REAL NOT NULL,
                site_type TEXT NOT NULL DEFAULT 'Rooftop',
                contract_status TEXT NOT NULL DEFAULT 'No',
                onboard_date TEXT,
                pm_cost REAL NOT NULL DEFAULT 0,
                cctv_cost REAL NOT NULL DEFAULT 0,
                cleaning_cost REAL NOT NULL DEFAULT 0,
                spv_id TEXT,
                spv_code TEXT,
                source_sheet TEXT,
                source_row INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (spv_id) REFERENCES spvs (id)
            )
        ''')
        
        # Create audit_log table (optional)
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
        
        conn.commit()
        
        # Insert default SPVs if table is empty
        cursor.execute('SELECT COUNT(*) FROM spvs')
        if cursor.fetchone()[0] == 0:
            default_spvs = [
                ('1', 'OS2', 'Olympus Solar 2 Ltd'),
                ('2', 'AD1', 'AMPYR Distributed Energy 1 Ltd'),
                ('3', 'FS', 'Fylde Solar Ltd'),
                ('4', 'ESI8', 'Eden Sustainable Investments 8 Ltd'),
                ('5', 'ESI1', 'Eden Sustainable Investments 1 Ltd'),
                ('6', 'ESI10', 'Eden Sustainable Investments 10 Ltd'),
                ('7', 'UV1', 'ULTRAVOLT SPV1 LIMITED'),
                ('8', 'SKY', 'Skylight Energy Ltd'),
            ]
            cursor.executemany(
                'INSERT INTO spvs (id, code, name) VALUES (?, ?, ?)',
                default_spvs
            )
            conn.commit()
        
        # Insert default rate tiers if table is empty
        cursor.execute('SELECT COUNT(*) FROM rate_tiers')
        if cursor.fetchone()[0] == 0:
            default_tiers = [
                ('1', '<20MW', 0, 20, 2.0),
                ('2', '20-30MW', 20, 30, 1.8),
                ('3', '30-40MW', 30, 40, 1.7),
            ]
            cursor.executemany(
                'INSERT INTO rate_tiers (id, tier_name, min_capacity_mw, max_capacity_mw, rate_per_kwp) VALUES (?, ?, ?, ?, ?)',
                default_tiers
            )
            conn.commit()


def generate_id() -> str:
    """Generate a unique ID for records."""
    import uuid
    return str(uuid.uuid4())[:15]


# ============ SPV Operations ============

def get_spvs() -> list[dict]:
    """Get all SPVs."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM spvs ORDER BY code')
        return [dict(row) for row in cursor.fetchall()]


def get_spv_by_code(code: str) -> Optional[dict]:
    """Get an SPV by its code."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM spvs WHERE code = ?', (code,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_spv_by_id(spv_id: str) -> Optional[dict]:
    """Get an SPV by its ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM spvs WHERE id = ?', (spv_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


# ============ Rate Tier Operations ============

def get_rate_tiers() -> list[dict]:
    """Get all rate tiers."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rate_tiers ORDER BY min_capacity_mw')
        return [dict(row) for row in cursor.fetchall()]


def update_rate_tier(tier_id: str, rate_per_kwp: float) -> bool:
    """Update a rate tier's rate per kWp."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE rate_tiers SET rate_per_kwp = ? WHERE id = ?',
            (rate_per_kwp, tier_id)
        )
        conn.commit()
        return cursor.rowcount > 0


# ============ Site Operations ============

def get_sites() -> list[dict]:
    """Get all sites."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sites ORDER BY name')
        return [dict(row) for row in cursor.fetchall()]


def get_site_by_id(site_id: str) -> Optional[dict]:
    """Get a site by its ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sites WHERE id = ?', (site_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def create_site(
    name: str,
    system_size_kwp: float,
    site_type: str = 'Rooftop',
    contract_status: str = 'No',
    onboard_date: Optional[str] = None,
    pm_cost: float = 0,
    cctv_cost: float = 0,
    cleaning_cost: float = 0,
    spv_id: Optional[str] = None,
    spv_code: Optional[str] = None,
    source_sheet: Optional[str] = None,
    source_row: Optional[int] = None
) -> dict:
    """Create a new site."""
    site_id = generate_id()
    now = datetime.now().isoformat()
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO sites (
                id, name, system_size_kwp, site_type, contract_status,
                onboard_date, pm_cost, cctv_cost, cleaning_cost,
                spv_id, spv_code, source_sheet, source_row,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            site_id, name, system_size_kwp, site_type, contract_status,
            onboard_date, pm_cost, cctv_cost, cleaning_cost,
            spv_id, spv_code, source_sheet, source_row,
            now, now
        ))
        conn.commit()
    
    return get_site_by_id(site_id)


def update_site(site_id: str, **kwargs) -> Optional[dict]:
    """Update a site."""
    site = get_site_by_id(site_id)
    if not site:
        return None
    
    # Build update query dynamically
    allowed_fields = [
        'name', 'system_size_kwp', 'site_type', 'contract_status',
        'onboard_date', 'pm_cost', 'cctv_cost', 'cleaning_cost',
        'spv_id', 'spv_code'
    ]
    
    updates = []
    values = []
    for field, value in kwargs.items():
        if field in allowed_fields:
            updates.append(f'{field} = ?')
            values.append(value)
    
    if not updates:
        return site
    
    updates.append('updated_at = ?')
    values.append(datetime.now().isoformat())
    values.append(site_id)
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = f'UPDATE sites SET {", ".join(updates)} WHERE id = ?'
        cursor.execute(query, values)
        conn.commit()
    
    return get_site_by_id(site_id)


def delete_site(site_id: str) -> bool:
    """Delete a site."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sites WHERE id = ?', (site_id,))
        conn.commit()
        return cursor.rowcount > 0


def delete_all_sites() -> int:
    """Delete all sites (for reimport). Returns count of deleted sites."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM sites')
        count = cursor.fetchone()[0]
        cursor.execute('DELETE FROM sites')
        conn.commit()
        return count


def import_sites(sites_data: list[dict]) -> list[dict]:
    """Bulk import sites. Replaces all existing sites."""
    delete_all_sites()
    
    imported = []
    for site_data in sites_data:
        site = create_site(
            name=site_data.get('name', ''),
            system_size_kwp=site_data.get('system_size_kwp', 0),
            site_type=site_data.get('site_type', 'Rooftop'),
            contract_status=site_data.get('contract_status', 'No'),
            onboard_date=site_data.get('onboard_date'),
            pm_cost=site_data.get('pm_cost', 0),
            cctv_cost=site_data.get('cctv_cost', 0),
            cleaning_cost=site_data.get('cleaning_cost', 0),
            spv_id=site_data.get('spv_id'),
            spv_code=site_data.get('spv_code'),
            source_sheet=site_data.get('source_sheet'),
            source_row=site_data.get('source_row'),
        )
        imported.append(site)
    
    return imported


# Initialize database on module load
init_database()
