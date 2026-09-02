"""
Settings page - rate tier configuration, worked examples and formula reference.
"""

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations  # noqa: E402
import db  # noqa: E402
import ui  # noqa: E402
from validation import ValidationError  # noqa: E402

ui.setup_page('Settings', '⚙️', 'Configure portfolio rate tiers')

tiers = db.get_rate_tiers()
sites = db.get_sites()
summary = calculations.calculate_portfolio_summary(sites, tiers)
current_tier_name = summary['current_tier']

# ---------- Current tiers ----------
st.subheader('Rate tiers')
st.caption(
    'The portfolio rate (£/kWp) depends on total **contracted** capacity. '
    f"Currently **{summary['contracted_capacity_kwp'] / 1000:,.2f} MW** contracted → tier **{current_tier_name}**."
)

if tiers:
    view = pd.DataFrame([
        {
            'Tier': t['tier_name'],
            'Current': '◀ current' if t['tier_name'] == current_tier_name else '',
            'From (MW)': t['min_capacity_mw'],
            'To (MW)': t['max_capacity_mw'],
            'Rate (£/kWp)': t['rate_per_kwp'],
        }
        for t in tiers
    ])
    st.dataframe(
        view,
        width='stretch',
        hide_index=True,
        column_config={
            'From (MW)': st.column_config.NumberColumn(format='%.0f'),
            'To (MW)': st.column_config.NumberColumn(format='%.0f'),
            'Rate (£/kWp)': st.column_config.NumberColumn(format='£%.2f'),
        },
    )

    # ---------- Edit ----------
    st.subheader('Edit rates')
    st.caption('Changing a rate immediately re-prices every contracted site in that tier. Changes are recorded in the audit log.')
    with st.form('edit_rates_form'):
        new_rates = {}
        cols = st.columns(len(tiers))
        for col, tier in zip(cols, tiers):
            with col:
                new_rates[tier['id']] = st.number_input(
                    f"{tier['tier_name']} (£/kWp)",
                    min_value=0.01,
                    max_value=100.0,
                    value=float(tier['rate_per_kwp']),
                    step=0.05,
                    format='%.2f',
                    key=f"rate_{tier['id']}",
                )
        submitted = st.form_submit_button('💾 Save changes', type='primary')

    if submitted:
        ordered = sorted(tiers, key=lambda t: t['min_capacity_mw'])
        rates_in_order = [new_rates[t['id']] for t in ordered]
        warnings = []
        if any(later > earlier for earlier, later in zip(rates_in_order, rates_in_order[1:])):
            warnings.append('Rates normally decrease as capacity grows — a higher tier has a higher rate than the one below it.')
        changed = [t for t in tiers if abs(new_rates[t['id']] - t['rate_per_kwp']) > 1e-9]
        if not changed:
            st.info('No changes to save.')
        else:
            try:
                for tier in changed:
                    db.update_rate_tier(tier['id'], new_rates[tier['id']])
            except ValidationError as exc:
                ui.show_errors(exc.errors)
            else:
                if warnings:
                    ui.show_warnings(warnings, 'Saved, but please check:')
                st.toast(f'Updated {len(changed)} rate tier(s)', icon='✅')
                st.rerun()
else:
    st.warning('No rate tiers configured.')

st.markdown('---')

# ---------- Worked example ----------
st.subheader('Worked example')
st.caption('See how a site of a given size is priced in each tier.')
tiers_for_calc = tiers or calculations.DEFAULT_RATE_TIERS

e1, e2, e3, e4 = st.columns(4)
with e1:
    example_size = st.number_input('System size (kWp)', min_value=1.0, value=500.0, step=50.0, format='%.0f')
with e2:
    example_pm = st.number_input('PM cost (£)', min_value=0.0, value=500.0, step=50.0, format='%.0f')
with e3:
    example_cctv = st.number_input('CCTV cost (£)', min_value=0.0, value=200.0, step=50.0, format='%.0f')
with e4:
    example_cleaning = st.number_input('Cleaning cost (£)', min_value=0.0, value=300.0, step=50.0, format='%.0f')

fixed_costs = calculations.calculate_site_fixed_costs(example_pm, example_cctv, example_cleaning)
rows = []
for tier in tiers_for_calc:
    portfolio_cost = calculations.calculate_portfolio_cost(example_size, tier['rate_per_kwp'])
    fixed_fee = calculations.calculate_fixed_fee(fixed_costs, portfolio_cost)
    rows.append({
        'Tier': tier['tier_name'] + (' ◀ current' if tier['tier_name'] == current_tier_name else ''),
        'Rate (£/kWp)': tier['rate_per_kwp'],
        'Site fixed costs': fixed_costs,
        'Portfolio cost': portfolio_cost,
        'Fixed fee (annual)': fixed_fee,
        'Fee per kWp': calculations.calculate_fee_per_kwp(fixed_fee, example_size, True),
        'Monthly fee': calculations.calculate_monthly_fee(fixed_fee),
    })
st.dataframe(
    pd.DataFrame(rows),
    width='stretch',
    hide_index=True,
    column_config={
        'Rate (£/kWp)': st.column_config.NumberColumn(format='£%.2f'),
        'Site fixed costs': st.column_config.NumberColumn(format='£%,.2f'),
        'Portfolio cost': st.column_config.NumberColumn(format='£%,.2f'),
        'Fixed fee (annual)': st.column_config.NumberColumn(format='£%,.2f'),
        'Fee per kWp': st.column_config.NumberColumn(format='£%.2f'),
        'Monthly fee': st.column_config.NumberColumn(format='£%,.2f'),
    },
)

st.markdown('---')

# ---------- Formula reference ----------
st.subheader('Formula reference')
st.markdown(
    """
| Calculation | Formula |
|-------------|---------|
| **Site fixed costs** | PM cost + CCTV cost + Cleaning cost |
| **Portfolio cost** | System size (kWp) × Rate per kWp for the portfolio's current tier |
| **Fixed fee** | Site fixed costs + Portfolio cost |
| **Fee per kWp** | Fixed fee ÷ System size (contracted sites only) |
| **Monthly fee** | Fixed fee ÷ 12 (contracted sites only) |
| **Portfolio tier** | Determined by total contracted capacity (MW) |
| **CM days accrued / month** | Contracted capacity (MW) ÷ 12, rounded to 0.1 |
"""
)

st.markdown('---')
st.subheader('Database')
st.caption(f'SQLite file: `{db.DB_PATH}` · {len(sites)} sites · {db.count_audit_entries()} audit entries')
st.caption('Set the `CLEARSOL_DB_PATH` environment variable to store the database elsewhere.')
