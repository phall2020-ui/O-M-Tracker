"""
SPVs page - Special Purpose Vehicles with their sites, capacity and revenue,
plus unassigned sites and unrecognised SPV codes.
"""

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations  # noqa: E402
import db  # noqa: E402
import ui  # noqa: E402

ui.setup_page('SPVs', '🏦', 'Special Purpose Vehicles and the sites they own')

spvs = db.get_spvs()
sites = db.get_sites()
tiers = db.get_rate_tiers()
sites_with_calcs, current_tier = calculations.calculate_sites_at_current_tier(sites, tiers)
known_codes = {spv['code'] for spv in spvs}


def summarise(spv_sites: list[dict]) -> dict:
    contracted = [s for s in spv_sites if s.get('contract_status') == 'Yes']
    return {
        'total_sites': len(spv_sites),
        'contracted_sites': len(contracted),
        'total_capacity_kwp': sum(s['system_size_kwp'] for s in spv_sites),
        'contracted_capacity_kwp': sum(s['system_size_kwp'] for s in contracted),
        'total_monthly_fee': sum(s['monthly_fee'] for s in contracted),
    }


spv_summary = {}
for spv in spvs:
    spv_summary[spv['code']] = {
        'code': spv['code'],
        'name': spv['name'],
        **summarise([s for s in sites_with_calcs if s.get('spv_code') == spv['code']]),
    }

# ---------- Overview ----------
st.subheader('SPV overview')
st.caption(f"Monthly revenue priced at current tier **{current_tier['tier_name']}** (£{current_tier['rate_per_kwp']:.2f}/kWp)")

df = pd.DataFrame(spv_summary.values())
if not df.empty:
    df['Total Capacity (MW)'] = df['total_capacity_kwp'] / 1000
    df['Contracted (MW)'] = df['contracted_capacity_kwp'] / 1000
    df['Share of contracted capacity'] = (
        df['contracted_capacity_kwp'] / df['contracted_capacity_kwp'].sum()
        if df['contracted_capacity_kwp'].sum() else 0
    )
    view = df[[
        'code', 'name', 'total_sites', 'contracted_sites', 'Total Capacity (MW)',
        'Contracted (MW)', 'Share of contracted capacity', 'total_monthly_fee',
    ]].rename(columns={
        'code': 'SPV', 'name': 'Name', 'total_sites': 'Sites',
        'contracted_sites': 'Contracted sites', 'total_monthly_fee': 'Monthly Revenue',
    })
    st.dataframe(
        view.sort_values('Contracted (MW)', ascending=False),
        width='stretch',
        hide_index=True,
        column_config={
            'SPV': st.column_config.TextColumn(width='small'),
            'Name': st.column_config.TextColumn(width='medium'),
            'Total Capacity (MW)': st.column_config.NumberColumn(format='%.2f'),
            'Contracted (MW)': st.column_config.NumberColumn(format='%.2f'),
            'Share of contracted capacity': st.column_config.ProgressColumn(format='%.0f%%', min_value=0, max_value=1),
            'Monthly Revenue': st.column_config.NumberColumn(format='£%,.2f'),
        },
    )
else:
    st.info('No SPVs configured.')

st.markdown('---')

# ---------- Detail ----------
st.subheader('SPV details')
selected = st.selectbox(
    'Select an SPV',
    options=[''] + [spv['code'] for spv in spvs],
    format_func=lambda c: f"{c} — {spv_summary[c]['name']}" if c else '— Select an SPV —',
    label_visibility='collapsed',
)

if selected:
    data = spv_summary[selected]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric('Sites', data['total_sites'], delta=f"{data['contracted_sites']} contracted", delta_color='off')
    c2.metric('Total capacity', ui.mw(data['total_capacity_kwp']))
    c3.metric('Contracted capacity', ui.mw(data['contracted_capacity_kwp']))
    c4.metric('Monthly revenue', ui.money(data['total_monthly_fee']))

    spv_sites = [s for s in sites_with_calcs if s.get('spv_code') == selected]
    if spv_sites:
        table = pd.DataFrame(spv_sites)[[
            'name', 'system_size_kwp', 'contract_status', 'onboard_date', 'site_fixed_costs', 'monthly_fee'
        ]].rename(columns={
            'name': 'Site Name', 'system_size_kwp': 'Size (kWp)', 'contract_status': 'Contract',
            'onboard_date': 'Onboard Date', 'site_fixed_costs': 'Site Costs', 'monthly_fee': 'Monthly Fee',
        })
        table['Onboard Date'] = pd.to_datetime(table['Onboard Date'], errors='coerce')
        st.dataframe(
            table,
            width='stretch',
            hide_index=True,
            column_config={
                'Size (kWp)': st.column_config.NumberColumn(format='%,.2f'),
                'Onboard Date': st.column_config.DateColumn(format='DD/MM/YYYY'),
                'Site Costs': st.column_config.NumberColumn(format='£%,.2f'),
                'Monthly Fee': st.column_config.NumberColumn(format='£%,.2f'),
            },
        )
        ui.export_buttons(table, f'clearsol_{selected}_sites', key=f'spv_export_{selected}')
    else:
        st.info(f'No sites assigned to {selected}.')

st.markdown('---')

# ---------- Data quality ----------
st.subheader('Assignment issues')
unassigned = [s for s in sites if not s.get('spv_code')]
unknown = [s for s in sites if s.get('spv_code') and s['spv_code'] not in known_codes]

if not unassigned and not unknown:
    st.success('All sites are assigned to a recognised SPV.')
else:
    if unknown:
        st.error(
            f"{len(unknown)} site(s) reference SPV codes that are not configured: "
            f"{', '.join(sorted({s['spv_code'] for s in unknown}))}. "
            'Edit the site to pick a valid SPV, or add the SPV to the defaults in `db.py`.'
        )
        st.dataframe(
            pd.DataFrame(unknown)[['name', 'spv_code', 'system_size_kwp', 'contract_status']]
            .rename(columns={'name': 'Site Name', 'spv_code': 'SPV code', 'system_size_kwp': 'Size (kWp)', 'contract_status': 'Contract'}),
            width='stretch', hide_index=True,
            column_config={'Size (kWp)': st.column_config.NumberColumn(format='%,.2f')},
        )
    if unassigned:
        st.warning(f'{len(unassigned)} site(s) have no SPV assigned.')
        st.dataframe(
            pd.DataFrame(unassigned)[['name', 'system_size_kwp', 'contract_status']]
            .rename(columns={'name': 'Site Name', 'system_size_kwp': 'Size (kWp)', 'contract_status': 'Contract'}),
            width='stretch', hide_index=True,
            column_config={'Size (kWp)': st.column_config.NumberColumn(format='%,.2f')},
        )
