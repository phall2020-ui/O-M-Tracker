"""
Audit Log page - every create, update, delete and import recorded by the
database layer, with the before/after values.
"""

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import ui  # noqa: E402

ui.setup_page('Audit Log', '📋', 'Who changed what, and when')

TABLE_LABELS = {
    'sites': 'Sites',
    'rate_tiers': 'Rate tiers',
    'cm_days_usage': 'CM days usage',
}
ACTION_LABELS = {
    'create': 'Created',
    'update': 'Updated',
    'delete': 'Deleted',
    'delete_all': 'Deleted all',
    'import': 'Imported',
}

f1, f2, f3 = st.columns([2, 2, 1])
with f1:
    table_filter = st.selectbox(
        'Record type', ['All'] + list(TABLE_LABELS), format_func=lambda t: TABLE_LABELS.get(t, t)
    )
with f2:
    action_filter = st.selectbox(
        'Action', ['All'] + list(ACTION_LABELS), format_func=lambda a: ACTION_LABELS.get(a, a)
    )
with f3:
    limit = st.selectbox('Show', [100, 250, 500, 1000], index=1)

entries = db.get_audit_log(
    limit=limit,
    table_name=None if table_filter == 'All' else table_filter,
    action=None if action_filter == 'All' else action_filter,
)

total = db.count_audit_entries()
st.caption(f'Showing {len(entries)} of {total} audit entries (most recent first).')

if not entries:
    st.info('No changes have been recorded yet. Creating, editing, deleting or importing sites will appear here.')
    st.stop()


def describe(entry: dict) -> tuple[str, str]:
    """Return (record label, human summary of the change)."""
    old, new = entry.get('old_values') or {}, entry.get('new_values') or {}
    table, action = entry['table_name'], entry['action']

    if table == 'sites':
        if action == 'import':
            return 'All sites', f"Imported {new.get('sites_imported', '?')} sites, replacing {old.get('sites_replaced', 0)}"
        if action == 'delete_all':
            return 'All sites', f"Deleted {old.get('count', '?')} sites"
        name = new.get('name') or old.get('name') or entry['record_id']
        if action == 'create':
            return name, f"Created ({new.get('system_size_kwp', 0):,.2f} kWp, {new.get('contract_status', '?')}, SPV {new.get('spv_code') or '—'})"
        if action == 'delete':
            return name, f"Deleted ({old.get('system_size_kwp', 0):,.2f} kWp, SPV {old.get('spv_code') or '—'})"
        changes = ', '.join(f'{k}: {old.get(k)!r} → {v!r}' for k, v in new.items())
        return name, changes or 'Updated'

    if table == 'rate_tiers':
        return new.get('tier_name') or old.get('tier_name') or entry['record_id'], \
            f"Rate £{old.get('rate_per_kwp', 0):.2f} → £{new.get('rate_per_kwp', 0):.2f}/kWp"

    if table == 'cm_days_usage':
        month = entry['record_id']
        if action == 'create':
            return month, f"Recorded {new.get('days_used', 0):.1f} days used" + (f" — {new['notes']}" if new.get('notes') else '')
        if action == 'delete':
            return month, f"Removed record of {old.get('days_used', 0):.1f} days used"
        return month, f"Days used {old.get('days_used', 0):.1f} → {new.get('days_used', 0):.1f}" + \
            (f"; notes: {new.get('notes') or '—'}" if old.get('notes') != new.get('notes') else '')

    return entry['record_id'], action


rows = []
for entry in entries:
    record, summary = describe(entry)
    rows.append({
        'When': ui.fmt_datetime(entry['timestamp']),
        'Type': TABLE_LABELS.get(entry['table_name'], entry['table_name']),
        'Action': ACTION_LABELS.get(entry['action'], entry['action']),
        'Record': record,
        'Change': summary,
    })

st.dataframe(
    pd.DataFrame(rows),
    width='stretch',
    hide_index=True,
    column_config={
        'When': st.column_config.TextColumn(width='small'),
        'Type': st.column_config.TextColumn(width='small'),
        'Action': st.column_config.TextColumn(width='small'),
        'Record': st.column_config.TextColumn(width='medium'),
        'Change': st.column_config.TextColumn(width='large'),
    },
)

with st.expander('Raw entries (JSON)'):
    st.json(entries[:50])

st.markdown('---')
ui.export_buttons(pd.DataFrame(rows), 'clearsol_audit_log', key='audit_export')
