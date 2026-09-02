"""
Clearsol O&M Portfolio Tracker - Streamlit Application
Main entry point and Dashboard page.
"""

import pandas as pd
import streamlit as st

import calculations
import cm_days
import data_quality
import db
import ui

ui.setup_page('Dashboard', '📊', 'Portfolio overview')

sites = db.get_sites()
spvs = db.get_spvs()
tiers = db.get_rate_tiers()
summary = calculations.calculate_portfolio_summary(sites, tiers)
issues = data_quality.check_sites(sites, spvs)
issue_counts = data_quality.summarise(issues)

if not sites:
    st.info(
        'No sites yet. **Import your Portfolio Tracker spreadsheet** or add a site manually to get started.'
    )
    col_a, col_b = st.columns(2)
    with col_a:
        st.page_link('pages/5_Import_Data.py', label='Import from Excel', icon='📤', width='stretch')
    with col_b:
        if st.button('➕ Add a site manually', width='stretch'):
            ui.go_to_new_site()
    st.stop()

# ---------- Headline metrics ----------
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric(
        '🏢 Total Sites',
        summary['total_sites'],
        delta=f"{summary['contracted_sites']} contracted",
        delta_color='off',
    )
with col2:
    st.metric(
        '⚡ Total Capacity',
        ui.mw(summary['total_capacity_kwp'], 1),
        delta=f"{summary['contracted_capacity_kwp'] / 1000:,.1f} MW contracted",
        delta_color='off',
    )
with col3:
    st.metric(
        '💷 Monthly Revenue',
        ui.money(summary['total_monthly_fee']),
        delta=f"{ui.money(summary['total_annual_fee'])} / year",
        delta_color='off',
        help=f"Contracted sites' fixed fees ÷ 12, priced at the current tier "
             f"({summary['current_tier']} — £{summary['current_rate_per_kwp']:.2f}/kWp).",
    )
with col4:
    st.metric(
        '📅 Current Tier',
        summary['current_tier'],
        delta=f"{summary['corrective_days_allowed']:.1f} CM days / month",
        delta_color='off',
        help='Tier is determined by contracted capacity. CM days accrue at 1 day per MW per year.',
    )

# ---------- Tier progress ----------
progress = calculations.next_tier_progress(summary['contracted_capacity_kwp'] / 1000, tiers)
current = progress['current_tier']
nxt = progress['next_tier']
with st.container(border=True):
    if nxt:
        st.markdown(
            f"**Tier progress** — {summary['contracted_capacity_kwp'] / 1000:,.2f} MW contracted. "
            f"**{progress['mw_to_next_tier']:,.2f} MW** more reaches **{nxt['tier_name']}** "
            f"(£{current['rate_per_kwp']:.2f} → £{nxt['rate_per_kwp']:.2f}/kWp)."
        )
    else:
        st.markdown(
            f"**Tier progress** — {summary['contracted_capacity_kwp'] / 1000:,.2f} MW contracted. "
            f"Portfolio is in the top tier (**{current['tier_name']}**)."
        )
    st.progress(progress['progress'])

# ---------- Data quality ----------
if issue_counts['total']:
    severity = 'error' if issue_counts['error'] else 'warning'
    headline = (
        f"**Data quality:** {issue_counts['error']} error(s), {issue_counts['warning']} warning(s), "
        f"{issue_counts['info']} note(s) across {issue_counts['sites_affected']} site(s)."
    )
    (st.error if severity == 'error' else st.warning)(headline)
    with st.expander('Show data-quality issues', expanded=bool(issue_counts['error'])):
        st.dataframe(
            data_quality.issues_frame(issues),
            width='stretch',
            hide_index=True,
            column_config={
                'Severity': st.column_config.TextColumn(width='small'),
                'Site': st.column_config.TextColumn(width='medium'),
            },
        )
        if issue_counts['fixable']:
            if st.button(f"🔧 Repair {issue_counts['fixable']} SPV link(s) automatically"):
                fixed = db.repair_spv_links()
                st.success(f'Repaired {fixed} site(s).')
                st.rerun()
else:
    st.success('**Data quality:** no issues detected across the portfolio.')

st.markdown('---')

# ---------- Breakdown by SPV ----------
col_left, col_right = st.columns([3, 2])

with col_left:
    st.subheader('Capacity by SPV')
    spv_names = {spv['code']: spv['name'] for spv in spvs}
    rows = []
    for code, count in summary['sites_by_spv'].items():
        spv_sites = [s for s in sites if (s.get('spv_code') or 'Unassigned') == code]
        contracted_kwp = sum(s['system_size_kwp'] for s in spv_sites if s.get('contract_status') == 'Yes')
        rows.append({
            'SPV': code,
            'Name': spv_names.get(code, '—' if code == 'Unassigned' else 'Unknown code'),
            'Sites': count,
            'Contracted (MW)': round(contracted_kwp / 1000, 3),
            'Not contracted (MW)': round((summary['capacity_by_spv'][code] - contracted_kwp) / 1000, 3),
        })
    df_spv = pd.DataFrame(rows).sort_values('Contracted (MW)', ascending=False)
    st.bar_chart(
        df_spv.set_index('SPV')[['Contracted (MW)', 'Not contracted (MW)']],
        color=['#2563EB', '#CBD5E1'],
        stack=True,
        height=260,
    )
    st.dataframe(
        df_spv,
        width='stretch',
        hide_index=True,
        column_config={
            'Contracted (MW)': st.column_config.NumberColumn(format='%.2f'),
            'Not contracted (MW)': st.column_config.NumberColumn(format='%.2f'),
        },
    )

with col_right:
    st.subheader('Contracted capacity over time')
    onboarded = [
        s for s in sites if s.get('contract_status') == 'Yes' and s.get('onboard_date')
    ]
    if onboarded:
        df_time = pd.DataFrame({
            'month': [pd.Timestamp(s['onboard_date'][:10]).to_period('M').to_timestamp() for s in onboarded],
            'kwp': [s['system_size_kwp'] for s in onboarded],
        })
        df_time = df_time.groupby('month')['kwp'].sum().sort_index().cumsum() / 1000
        df_time = df_time.rename('Contracted MW').to_frame()
        st.line_chart(df_time, height=260, color='#059669')
        tracking = cm_days.calculate_cm_days_tracking(sites, db.get_cm_days_usage(), tiers)
        st.caption(
            f"Portfolio start {ui.fmt_date(tracking['portfolio_start_date'])} · "
            f"CM days balance **{tracking['total_remaining']:.1f}** "
            f"({tracking['total_used']:.1f} used of {tracking['total_accumulated']:.1f} accrued)"
        )
        st.page_link('pages/6_CM_Days.py', label='Open CM Days tracker', icon='🛠️')
    else:
        st.info('Add onboard dates to contracted sites to see the growth timeline and CM days balance.')

st.markdown('---')

# ---------- Quick actions ----------
st.subheader('Quick actions')
qa1, qa2, qa3, qa4 = st.columns(4)
with qa1:
    st.page_link('pages/1_Sites.py', label='View all sites', icon='📋', width='stretch')
with qa2:
    if st.button('➕ Add new site', width='stretch'):
        ui.go_to_new_site()
with qa3:
    st.page_link('pages/5_Import_Data.py', label='Import from Excel', icon='📤', width='stretch')
with qa4:
    st.page_link('pages/7_Audit_Log.py', label='Review recent changes', icon='📋', width='stretch')

st.caption(f'Portfolio Tracker v{ui.APP_VERSION} · Clearsol O&M')
