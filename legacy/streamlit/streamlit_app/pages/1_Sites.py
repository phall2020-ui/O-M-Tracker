"""
Sites listing page - filterable, sortable table of every site with
fees priced at the portfolio's current tier, plus CSV/Excel export.
"""

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations  # noqa: E402
import data_quality  # noqa: E402
import db  # noqa: E402
import ui  # noqa: E402

ui.setup_page('Sites', '🏢', 'View and manage all sites in your portfolio')

sites = db.get_sites()
spvs = db.get_spvs()
tiers = db.get_rate_tiers()
sites_with_calcs, current_tier = calculations.calculate_sites_at_current_tier(sites, tiers)
issues = data_quality.check_sites(sites, spvs)
issue_sites = {i['site_id'] for i in issues if i['severity'] in ('error', 'warning')}

# ---------- Toolbar ----------
tb1, tb2 = st.columns([5, 1])
with tb1:
    st.caption(
        f"{len(sites)} sites · fees shown at current tier **{current_tier['tier_name']}** "
        f"(£{current_tier['rate_per_kwp']:.2f}/kWp)"
    )
with tb2:
    if st.button('➕ Add Site', type='primary', width='stretch'):
        ui.go_to_new_site()

if not sites:
    st.info('No sites found. Import your data or add a new site.')
    st.page_link('pages/5_Import_Data.py', label='Import from Excel', icon='📤')
    st.stop()

# ---------- Filters ----------
with st.container(border=True):
    f1, f2, f3, f4, f5 = st.columns([3, 2, 2, 2, 2])
    with f1:
        search = st.text_input('Search', placeholder='Site name…', label_visibility='collapsed')
    with f2:
        spv_options = sorted({s.get('spv_code') or 'Unassigned' for s in sites})
        spv_filter = st.multiselect('SPV', spv_options, placeholder='All SPVs', label_visibility='collapsed')
    with f3:
        contract_filter = st.selectbox(
            'Contract', ['All contracts', 'Contracted', 'Not contracted'], label_visibility='collapsed'
        )
    with f4:
        type_filter = st.selectbox('Type', ['All types', 'Rooftop', 'Ground Mount'], label_visibility='collapsed')
    with f5:
        only_issues = st.toggle('Only sites with issues', value=False)

filtered = sites_with_calcs
if search:
    needle = search.strip().lower()
    filtered = [s for s in filtered if needle in (s.get('name') or '').lower()]
if spv_filter:
    filtered = [s for s in filtered if (s.get('spv_code') or 'Unassigned') in spv_filter]
if contract_filter == 'Contracted':
    filtered = [s for s in filtered if s.get('contract_status') == 'Yes']
elif contract_filter == 'Not contracted':
    filtered = [s for s in filtered if s.get('contract_status') != 'Yes']
if type_filter != 'All types':
    filtered = [s for s in filtered if s.get('site_type') == type_filter]
if only_issues:
    filtered = [s for s in filtered if s['id'] in issue_sites]

# ---------- Totals for the filtered set ----------
m1, m2, m3, m4 = st.columns(4)
contracted = [s for s in filtered if s.get('contract_status') == 'Yes']
m1.metric('Sites shown', f'{len(filtered)} / {len(sites)}')
m2.metric('Capacity', ui.mw(sum(s['system_size_kwp'] for s in filtered)))
m3.metric('Contracted capacity', ui.mw(sum(s['system_size_kwp'] for s in contracted)))
m4.metric('Monthly fee', ui.money(sum(s['monthly_fee'] for s in filtered)))

if not filtered:
    st.info('No sites match the current filters.')
    st.stop()

# ---------- Table ----------
df = pd.DataFrame(filtered)
df['issues'] = df['id'].map(lambda sid: '⚠️' if sid in issue_sites else '')
df['onboard_date'] = pd.to_datetime(df['onboard_date'], errors='coerce')
df['spv_code'] = df['spv_code'].fillna('—')

columns = {
    'issues': 'Flag',
    'name': 'Site Name',
    'spv_code': 'SPV',
    'system_size_kwp': 'Size (kWp)',
    'contract_status': 'Contract',
    'onboard_date': 'Onboard Date',
    'site_type': 'Type',
    'site_fixed_costs': 'Site Costs',
    'fixed_fee_current': f"Fixed Fee ({current_tier['tier_name']})",
    'fee_per_kwp_current': f"£/kWp ({current_tier['tier_name']})",
    'monthly_fee': 'Monthly Fee',
}
table = df[list(columns)].rename(columns=columns)

event = st.dataframe(
    table,
    width='stretch',
    hide_index=True,
    on_select='rerun',
    selection_mode='single-row',
    key='sites_table',
    column_config={
        'Flag': st.column_config.TextColumn(width='small', help='⚠️ = site has data-quality issues'),
        'Site Name': st.column_config.TextColumn(width='medium'),
        'SPV': st.column_config.TextColumn(width='small'),
        'Size (kWp)': st.column_config.NumberColumn(format='%,.2f'),
        'Contract': st.column_config.TextColumn(width='small'),
        'Onboard Date': st.column_config.DateColumn(format='DD/MM/YYYY'),
        'Type': st.column_config.TextColumn(width='small'),
        'Site Costs': st.column_config.NumberColumn(format='£%,.2f'),
        f"Fixed Fee ({current_tier['tier_name']})": st.column_config.NumberColumn(format='£%,.2f'),
        f"£/kWp ({current_tier['tier_name']})": st.column_config.NumberColumn(format='%.2f'),
        'Monthly Fee': st.column_config.NumberColumn(format='£%,.2f'),
    },
)
st.caption('Click a column header to sort. Select a row to view, edit or delete that site.')

# ---------- Selected row actions ----------
selected_rows = event.selection.rows if event and event.selection else []
if selected_rows:
    selected = filtered[selected_rows[0]]
    with st.container(border=True):
        head, a1, a2, a3 = st.columns([4, 1, 1, 1])
        with head:
            st.markdown(
                f"**{selected['name']}** · {selected['system_size_kwp']:,.2f} kWp · "
                f"{ui.contract_badge(selected['contract_status'])}",
                unsafe_allow_html=True,
            )
            site_issues = data_quality.issues_for_site(issues, selected['id'])
            if site_issues:
                st.caption(' · '.join(i['message'] for i in site_issues))
        with a1:
            if st.button('👁️ View', width='stretch'):
                ui.go_to_site(selected['id'])
        with a2:
            if st.button('✏️ Edit', width='stretch'):
                ui.go_to_site(selected['id'], edit=True)
        with a3:
            if st.button('🗑️ Delete', width='stretch'):
                st.session_state['delete_site_id'] = selected['id']
                st.session_state['delete_site_name'] = selected['name']

if 'delete_site_id' in st.session_state:
    st.warning(
        f"Delete **{st.session_state.get('delete_site_name', '')}**? "
        'This cannot be undone from the UI, but the record is kept in the audit log.'
    )
    d1, d2, _ = st.columns([1, 1, 4])
    with d1:
        if st.button('✅ Yes, delete', type='primary', width='stretch'):
            db.delete_site(st.session_state['delete_site_id'])
            name = st.session_state.pop('delete_site_name', '')
            st.session_state.pop('delete_site_id', None)
            st.toast(f'Deleted {name}', icon='🗑️')
            st.rerun()
    with d2:
        if st.button('Cancel', width='stretch'):
            st.session_state.pop('delete_site_id', None)
            st.session_state.pop('delete_site_name', None)
            st.rerun()

# ---------- Export ----------
st.markdown('---')
st.subheader('Export')
st.caption('Downloads the filtered rows with all calculated fee columns.')
export_cols = {
    'name': 'Site Name',
    'spv_code': 'SPV',
    'site_type': 'Site Type',
    'system_size_kwp': 'System Size (kWp)',
    'contract_status': 'Contracted',
    'onboard_date': 'Onboard Date',
    'pm_cost': 'PM Cost (£)',
    'cctv_cost': 'CCTV Cost (£)',
    'cleaning_cost': 'Cleaning Cost (£)',
    'site_fixed_costs': 'Site Fixed Costs (£)',
    'portfolio_cost_20mw': 'Portfolio Cost <20MW (£)',
    'portfolio_cost_30mw': 'Portfolio Cost 20-30MW (£)',
    'portfolio_cost_40mw': 'Portfolio Cost 30-40MW (£)',
    'fixed_fee_20mw': 'Fixed Fee <20MW (£)',
    'fixed_fee_30mw': 'Fixed Fee 20-30MW (£)',
    'fixed_fee_40mw': 'Fixed Fee 30-40MW (£)',
    'fee_per_kwp_20mw': '£/kWp <20MW',
    'fee_per_kwp_30mw': '£/kWp 20-30MW',
    'fee_per_kwp_40mw': '£/kWp 30-40MW',
    'applicable_tier': 'Applicable Tier',
    'monthly_fee': 'Monthly Fee (£)',
    'source_sheet': 'Source Sheet',
    'source_row': 'Source Row',
    'updated_at': 'Last Updated',
}
export_df = pd.DataFrame(filtered)[list(export_cols)].rename(columns=export_cols)
export_df['Onboard Date'] = pd.to_datetime(export_df['Onboard Date'], errors='coerce').dt.date
ui.export_buttons(export_df, 'clearsol_sites', key='sites_export')
