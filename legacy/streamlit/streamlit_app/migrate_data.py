"""
Data Migration Script - Migrate JSON data to SQLite database.
This script reads the existing JSON files from the Next.js app and imports them
into the new SQLite database for the Streamlit application.
"""

import json
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db
import importer

# Path to the JSON data files from the legacy Next.js app
LEGACY_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), 'legacy', 'nextjs', 'src', 'data'
)
SITES_JSON = os.path.join(LEGACY_DATA_DIR, 'sites.json')
SPVS_JSON = os.path.join(LEGACY_DATA_DIR, 'spvs.json')


def migrate_spvs():
    """Migrate SPVs from JSON to SQLite."""
    print("Migrating SPVs...")
    
    if not os.path.exists(SPVS_JSON):
        print(f"  SPVs file not found: {SPVS_JSON}")
        print("  Using default SPVs from database initialization.")
        return
    
    with open(SPVS_JSON, 'r') as f:
        spvs_data = json.load(f)
    
    if not spvs_data:
        print("  No SPVs found in JSON file.")
        return
    
    # SPVs are already initialized by db.init_database()
    # Only update if there are differences
    existing_spvs = {s['code']: s for s in db.get_spvs()}
    
    new_count = 0
    for spv in spvs_data:
        if spv['code'] not in existing_spvs:
            print(f"  Note: SPV {spv['code']} from JSON not in defaults.")
            new_count += 1
    
    print(f"  SPVs migration complete. {len(existing_spvs)} SPVs in database.")


def migrate_sites():
    """Migrate sites from JSON to SQLite."""
    print("Migrating sites...")
    
    if not os.path.exists(SITES_JSON):
        print(f"  Sites file not found: {SITES_JSON}")
        return 0
    
    with open(SITES_JSON, 'r') as f:
        sites_data = json.load(f)
    
    if not sites_data:
        print("  No sites found in JSON file.")
        return 0
    
    print(f"  Found {len(sites_data)} sites in JSON file.")
    
    # The legacy JSON uses camelCase; the importer normalises and validates it
    result = importer.parse_json_sites(sites_data, db.get_spvs_by_code())
    for row in result.error_rows:
        print(f"  ERROR row {row.source_row} ({row.raw.get('name')}): {'; '.join(row.errors)} — skipped")
    for row in result.warning_rows:
        print(f"  warning row {row.source_row} ({row.clean['name']}): {'; '.join(row.warnings)}")
    
    if not result.valid_sites:
        print("  No valid sites to import.")
        return 0
    
    # Import sites atomically (this replaces all existing)
    imported = db.import_sites(result.valid_sites)
    
    print(f"  Successfully migrated {len(imported)} sites to SQLite.")
    return len(imported)


def verify_migration():
    """Verify the migration was successful."""
    print("\nVerification:")
    
    sites = db.get_sites()
    spvs = db.get_spvs()
    tiers = db.get_rate_tiers()
    
    print(f"  Sites in database: {len(sites)}")
    print(f"  SPVs in database: {len(spvs)}")
    print(f"  Rate tiers in database: {len(tiers)}")
    
    if sites:
        contracted = len([s for s in sites if s.get('contract_status') == 'Yes'])
        total_capacity = sum(s.get('system_size_kwp', 0) for s in sites)
        print(f"  Contracted sites: {contracted}")
        print(f"  Total capacity: {total_capacity/1000:.2f} MW")
    
    return len(sites) > 0


def run_migration():
    """Run the full migration."""
    print("=" * 50)
    print("Clearsol O&M Portfolio Tracker - Data Migration")
    print("JSON → SQLite")
    print("=" * 50)
    print()
    
    # Initialize database (creates tables if not exist)
    print("Initializing database...")
    db.init_database()
    print("  Database initialized.")
    print()
    
    # Migrate SPVs first (sites reference them)
    migrate_spvs()
    print()
    
    # Migrate sites
    site_count = migrate_sites()
    print()
    
    # Verify
    success = verify_migration()
    print()
    
    if success:
        print("=" * 50)
        print("Migration completed successfully!")
        print("=" * 50)
    else:
        print("=" * 50)
        print("Migration completed. No sites were imported.")
        print("This may be because the JSON file was empty.")
        print("=" * 50)
    
    return success


if __name__ == '__main__':
    run_migration()
