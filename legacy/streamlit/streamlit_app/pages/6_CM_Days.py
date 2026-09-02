"""
CM Days page - corrective maintenance day accrual and usage, month by month
since the portfolio start, with editable "days used" and notes.
"""

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cm_days  # noqa: E402
import db  # noqa: E402
import ui  # noqa: E402
from validation import ValidationError  # noqa: E402

ui.setup_page('CM Days', '🛠️', 'Corrective maintenance days accrued vs. used')

sites = db.get_sites()
tiers = db.get_rate_tiers()
usage = db.get_cm_days_usage()
tracking = cm_days.calculate_cm_days_tracking(sites, usage, tiers)

st.caption(
    'The framework allows **1 CM day per MW of contracted capacity per year**, accrued monthly '
    '(capacity ÷ 12, rounded to 0.1). Capacity for each month is rebuilt from site onboard dates, '
    'so the history updates automatically when sites change.'
)

if not tracking['portfolio_start_date']:
    st.info(
        'No contracted sites with onboard dates yet. Add onboard dates to contracted sites to start tracking CM days.'
    )
    st.page_link('pages/1_Sites.py', label='Go to Sites', icon='🏢')
    if tracking['orphan_usage']:
        st.warning(f"{len(tracking['orphan_usage'])} month(s) of usage are recorded but cannot be matched to portfolio months.")
    st.stop()

monthly = tracking['monthly_data']
latest = monthly[-1]

# ---------- Summary ----------
c1, c2, c3, c4 = st.columns(4)
c1.metric('Portfolio start', ui.fmt_date(tracking['portfolio_start_date']), delta=f'{len(monthly)} months tracked', delta_color='off')
c2.metric('Total accrued', f"{tracking['total_accumulated']:.1f} days")
c3.metric('Total used', f"{tracking['total_used']:.1f} days")
c4.metric(
    'Balance remaining',
    f"{tracking['total_remaining']:.1f} days",
    delta=f"{latest['days_accumulated']:.1f} accruing this month",
    delta_color='normal' if tracking['total_remaining'] >= 0 else 'inverse',
)
if tracking['total_remaining'] < 0:
    st.error('CM days used exceed the days accrued — the portfolio is over its allowance.')

# ---------- Chart ----------
chart_df = pd.DataFrame(monthly).set_index('label')[['cumulative_accumulated', 'cumulative_used']]
chart_df.columns = ['Accrued (cumulative)', 'Used (cumulative)']
st.line_chart(chart_df, height=260, color=['#2563EB', '#EA580C'])

st.markdown('---')

# ---------- Editable ledger ----------
st.subheader('Monthly ledger')
st.caption('Edit **Days used** and **Notes** directly in the table, then save. Other columns are calculated.')

ledger = pd.DataFrame(monthly)
ledger_view = ledger[[
    'year_month', 'label', 'number_of_sites', 'capacity_mw', 'tier_name', 'fixed_cost', 'portfolio_cost',
    'total_fixed_cost', 'days_accumulated', 'days_used', 'days_remaining', 'cumulative_remaining', 'notes',
]].copy()
ledger_view = ledger_view.iloc[::-1].reset_index(drop=True)  # most recent first
ledger_view = ledger_view.rename(columns={
    'year_month': 'Key', 'label': 'Month', 'number_of_sites': 'Sites', 'capacity_mw': 'Capacity (MW)',
    'tier_name': 'Tier', 'fixed_cost': 'Site Costs', 'portfolio_cost': 'Portfolio Cost',
    'total_fixed_cost': 'Total Fixed', 'days_accumulated': 'Accrued', 'days_used': 'Days used',
    'days_remaining': 'Month balance', 'cumulative_remaining': 'Cumulative balance', 'notes': 'Notes',
})

edited = st.data_editor(
    ledger_view,
    width='stretch',
    hide_index=True,
    num_rows='fixed',
    key='cm_days_editor',
    disabled=[c for c in ledger_view.columns if c not in ('Days used', 'Notes')],
    column_config={
        'Key': None,
        'Month': st.column_config.TextColumn(width='small'),
        'Sites': st.column_config.NumberColumn(format='%d', width='small'),
        'Capacity (MW)': st.column_config.NumberColumn(format='%.2f'),
        'Tier': st.column_config.TextColumn(width='small'),
        'Site Costs': st.column_config.NumberColumn(format='£%,.0f'),
        'Portfolio Cost': st.column_config.NumberColumn(format='£%,.0f'),
        'Total Fixed': st.column_config.NumberColumn(format='£%,.0f'),
        'Accrued': st.column_config.NumberColumn(format='%.1f'),
        'Days used': st.column_config.NumberColumn(format='%.1f', min_value=0, step=0.5, help='Editable'),
        'Month balance': st.column_config.NumberColumn(format='%.1f'),
        'Cumulative balance': st.column_config.NumberColumn(format='%.1f'),
        'Notes': st.column_config.TextColumn(width='large', help='Editable — e.g. which site and what was fixed'),
    },
)

changes = []
for original, updated in zip(ledger_view.to_dict('records'), edited.to_dict('records')):
    new_days = 0.0 if pd.isna(updated['Days used']) else float(updated['Days used'])
    new_notes = '' if pd.isna(updated['Notes']) else str(updated['Notes'])
    old_notes = '' if pd.isna(original['Notes']) else str(original['Notes'])
    if abs(new_days - float(original['Days used'])) > 1e-9 or new_notes.strip() != old_notes.strip():
        changes.append((original['Key'], new_days, new_notes))

s1, s2 = st.columns([1, 5])
with s1:
    if st.button('💾 Save changes', type='primary', disabled=not changes, width='stretch'):
        try:
            for year_month, days, notes in changes:
                db.upsert_cm_days_usage(year_month, days, notes)
        except ValidationError as exc:
            ui.show_errors(exc.errors)
        else:
            st.toast(f'Saved {len(changes)} month(s)', icon='✅')
            st.rerun()
with s2:
    if changes:
        st.caption(f'{len(changes)} unsaved change(s): ' + ', '.join(cm_days.format_year_month(c[0]) for c in changes))

# ---------- Data quality ----------
if tracking['orphan_usage']:
    st.markdown('---')
    st.warning(
        f"{len(tracking['orphan_usage'])} usage record(s) fall outside the tracked period "
        '(before portfolio start or in the future) and are not counted:'
    )
    orphan_df = pd.DataFrame(tracking['orphan_usage'])[['year_month', 'days_used', 'notes']]
    st.dataframe(orphan_df, width='stretch', hide_index=True)
    for orphan in tracking['orphan_usage']:
        if st.button(f"Delete {orphan['year_month']} record", key=f"del_{orphan['year_month']}"):
            db.delete_cm_days_usage(orphan['year_month'])
            st.rerun()

# ---------- Export ----------
st.markdown('---')
export = ledger.drop(columns=['label']).rename(columns={
    'year_month': 'Month', 'number_of_sites': 'Sites', 'capacity_mw': 'Contracted Capacity (MW)', 'tier_name': 'Tier',
    'fixed_cost': 'Site Fixed Costs (£)', 'portfolio_cost': 'Portfolio Cost (£)', 'total_fixed_cost': 'Total Fixed (£)',
    'days_accumulated': 'CM Days Accrued', 'days_used': 'CM Days Used', 'days_remaining': 'Month Balance',
    'cumulative_accumulated': 'Cumulative Accrued', 'cumulative_used': 'Cumulative Used',
    'cumulative_remaining': 'Cumulative Balance', 'notes': 'Notes',
})
ui.export_buttons(export, 'clearsol_cm_days', key='cm_days_export')
