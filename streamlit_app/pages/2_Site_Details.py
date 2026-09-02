"""
Site Details page - view, edit and create individual sites, with fee
breakdowns by tier, data-quality flags and the site's change history.
"""

from __future__ import annotations

import os
import sys

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calculations  # noqa: E402
import data_quality  # noqa: E402
import db  # noqa: E402
import ui  # noqa: E402
import validation  # noqa: E402
from validation import ValidationError  # noqa: E402

site_id = st.session_state.get(ui.SITE_ID_KEY)
edit_mode = bool(st.session_state.get(ui.EDIT_MODE_KEY, False))

spvs = db.get_spvs()
spvs_by_code = {spv['code']: spv for spv in spvs}
spv_options = [''] + [spv['code'] for spv in spvs]


def spv_label(code: str) -> str:
    if not code:
        return '— None —'
    spv = spvs_by_code.get(code)
    return f"{code} — {spv['name']}" if spv else code


def site_form(existing: dict | None, key: str):
    """Render the create/edit form. Returns (submitted, cancelled, values)."""
    existing = existing or {}
    with st.form(key):
        st.subheader('Basic information')
        c1, c2 = st.columns(2)
        with c1:
            name = st.text_input('Site name *', value=existing.get('name', ''), max_chars=120)
            system_size = st.number_input(
                'System size (kWp) *',
                min_value=0.0,
                value=float(existing.get('system_size_kwp') or 0),
                step=1.0,
                format='%.2f',
                help='DC capacity in kilowatt-peak. 1,000 kWp = 1 MW.',
            )
            site_type = st.selectbox(
                'Site type',
                options=list(validation.SITE_TYPES),
                index=list(validation.SITE_TYPES).index(existing.get('site_type', 'Rooftop'))
                if existing.get('site_type') in validation.SITE_TYPES else 0,
            )
        with c2:
            contract_status = st.selectbox(
                'Contract status',
                options=['No', 'Yes'],
                index=1 if existing.get('contract_status') == 'Yes' else 0,
                help='Only contracted sites generate fees, count towards the tier and accrue CM days.',
            )
            onboard_date = st.date_input(
                'Onboard date',
                value=ui.to_date(existing.get('onboard_date')),
                format='DD/MM/YYYY',
                help='Required for contracted sites so CM days can be tracked from the right month.',
            )
            current_code = existing.get('spv_code') or ''
            options = spv_options if current_code in spv_options else spv_options + [current_code]
            spv_code = st.selectbox(
                'SPV', options=options, index=options.index(current_code), format_func=spv_label
            )

        st.subheader('Site fixed costs (annual, £)')
        k1, k2, k3 = st.columns(3)
        with k1:
            pm_cost = st.number_input('PM cost', min_value=0.0, value=float(existing.get('pm_cost') or 0), step=50.0, format='%.2f')
        with k2:
            cctv_cost = st.number_input('CCTV cost', min_value=0.0, value=float(existing.get('cctv_cost') or 0), step=50.0, format='%.2f')
        with k3:
            cleaning_cost = st.number_input('Cleaning cost', min_value=0.0, value=float(existing.get('cleaning_cost') or 0), step=50.0, format='%.2f')

        b1, b2, _ = st.columns([1, 1, 4])
        with b1:
            submitted = st.form_submit_button('💾 Save' if existing else '💾 Create site', type='primary', width='stretch')
        with b2:
            cancelled = st.form_submit_button('Cancel', width='stretch')

    values = {
        'name': name,
        'system_size_kwp': system_size,
        'site_type': site_type,
        'contract_status': contract_status,
        'onboard_date': onboard_date.isoformat() if onboard_date else None,
        'pm_cost': pm_cost,
        'cctv_cost': cctv_cost,
        'cleaning_cost': cleaning_cost,
        'spv_code': spv_code or None,
    }
    return submitted, cancelled, values


def validate_for_form(values: dict, exclude_id: str | None) -> tuple[dict, list[str], list[str]]:
    clean, errors, warnings = validation.normalise_site(
        values, db.get_spvs_by_code(), require_positive_size=True
    )
    if clean.get('name') and db.find_sites_by_name(clean['name'], exclude_id=exclude_id):
        warnings.append(f'Another site is already called "{clean["name"]}"')
    return clean, errors, warnings


# ======================================================================
# Existing site
# ======================================================================
if site_id:
    site = db.get_site_by_id(site_id)
    if not site:
        ui.setup_page('Site not found', '📍')
        st.error('This site no longer exists — it may have been deleted or replaced by an import.')
        if st.button('← Back to Sites'):
            ui.go_to_sites()
        st.stop()

    all_sites = db.get_sites()
    tiers = db.get_rate_tiers()
    current_tier = calculations.current_portfolio_tier(all_sites, tiers)
    calc = calculations.calculate_site_with_all_tiers(site, tiers, current_tier['tier_name'])
    site_issues = data_quality.issues_for_site(data_quality.check_sites(all_sites, spvs), site_id)

    if edit_mode:
        ui.setup_page('Edit Site', '✏️', site['name'])
    else:
        ui.setup_page(site['name'], '📍', f"{site.get('site_type', 'Rooftop')} · {site['system_size_kwp']:,.2f} kWp")

    nav1, nav2, nav3, _ = st.columns([1, 1, 1, 4])
    with nav1:
        if st.button('← Sites', width='stretch'):
            ui.go_to_sites()
    if not edit_mode:
        with nav2:
            if st.button('✏️ Edit', width='stretch'):
                st.session_state[ui.EDIT_MODE_KEY] = True
                st.rerun()
        with nav3:
            if st.button('🗑️ Delete', width='stretch'):
                st.session_state['confirm_delete'] = True

        if st.session_state.get('confirm_delete'):
            st.warning(f"Delete **{site['name']}**? The record will remain visible in the audit log.")
            d1, d2, _ = st.columns([1, 1, 4])
            with d1:
                if st.button('✅ Yes, delete', type='primary', width='stretch'):
                    db.delete_site(site_id)
                    ui.clear_site_selection()
                    st.toast(f"Deleted {site['name']}", icon='🗑️')
                    st.switch_page('pages/1_Sites.py')
            with d2:
                if st.button('Cancel', width='stretch'):
                    st.session_state.pop('confirm_delete', None)
                    st.rerun()

    st.markdown('---')

    if edit_mode:
        submitted, cancelled, values = site_form(site, 'edit_site_form')
        if cancelled:
            st.session_state[ui.EDIT_MODE_KEY] = False
            st.rerun()
        if submitted:
            clean, errors, warnings = validate_for_form(values, exclude_id=site_id)
            if errors:
                ui.show_errors(errors)
            else:
                try:
                    db.update_site(site_id, **clean)
                except ValidationError as exc:
                    ui.show_errors(exc.errors)
                else:
                    if warnings:
                        ui.show_warnings(warnings, 'Saved, but please check:')
                    st.session_state[ui.EDIT_MODE_KEY] = False
                    st.toast('Site updated', icon='✅')
                    st.rerun()
    else:
        if st.session_state.get('post_create_warnings'):
            ui.show_warnings(st.session_state.pop('post_create_warnings'), 'Site created, but please check:')
        elif site_issues:
            ui.show_warnings([i['message'] for i in site_issues], 'Data-quality flags for this site:')

        left, right = st.columns(2)
        with left:
            st.subheader('Basic information')
            st.markdown(
                f"""
| Field | Value |
|-------|-------|
| **Site name** | {site['name']} |
| **System size** | {site['system_size_kwp']:,.2f} kWp ({site['system_size_kwp'] / 1000:,.3f} MW) |
| **Site type** | {site.get('site_type', 'Rooftop')} |
| **Contract status** | {'✅ Contracted' if site.get('contract_status') == 'Yes' else '⬜ Not contracted'} |
| **Onboard date** | {ui.fmt_date(site.get('onboard_date'))} |
| **SPV** | {spv_label(site.get('spv_code') or '')} |
"""
            )
        with right:
            st.subheader('Site fixed costs (annual)')
            st.markdown(
                f"""
| Cost | Amount |
|------|--------|
| **PM cost** | {ui.money(site.get('pm_cost'))} |
| **CCTV cost** | {ui.money(site.get('cctv_cost'))} |
| **Cleaning cost** | {ui.money(site.get('cleaning_cost'))} |
| **Total site costs** | **{ui.money(calc['site_fixed_costs'])}** |
"""
            )

        st.markdown('---')
        st.subheader('Fee calculations by portfolio tier')
        st.caption(
            f"Portfolio is currently in tier **{current_tier['tier_name']}** "
            f"(£{current_tier['rate_per_kwp']:.2f}/kWp) — highlighted column applies."
        )
        tier_cols = [('<20MW', '20mw'), ('20-30MW', '30mw'), ('30-40MW', '40mw')]
        fee_rows = {
            'Metric': ['Rate (£/kWp)', 'Portfolio cost', 'Fixed fee (annual)', 'Fee per kWp', 'Monthly fee'],
        }
        rates = {t['tier_name']: t['rate_per_kwp'] for t in tiers}
        is_contracted = site.get('contract_status') == 'Yes'
        for label, suffix in tier_cols:
            header = f'{label} ◀ current' if label == current_tier['tier_name'] else label
            fee_rows[header] = [
                f"£{rates.get(label, 0):.2f}",
                ui.money(calc[f'portfolio_cost_{suffix}']),
                ui.money(calc[f'fixed_fee_{suffix}']),
                ui.number(calc[f'fee_per_kwp_{suffix}'], dash_if_zero=True),
                ui.money(calc[f'fixed_fee_{suffix}'] / 12) if is_contracted else '—',
            ]
        st.table(pd.DataFrame(fee_rows).set_index('Metric'))

        if is_contracted:
            st.success(
                f"**Monthly fee at current tier: {ui.money(calc['monthly_fee'])}** "
                f"({ui.money(calc['fixed_fee_current'])} per year)"
            )
        else:
            st.info('Site is not contracted — no fees are charged and it does not count towards the tier.')

        with st.expander('Record details & change history'):
            st.caption(
                f"Created {ui.fmt_datetime(site.get('created_at'))} · "
                f"Updated {ui.fmt_datetime(site.get('updated_at'))} · "
                + (f"Imported from {site['source_sheet']} row {site['source_row']}"
                   if site.get('source_sheet') else 'Entered manually')
                + f" · ID `{site['id']}`"
            )
            history = db.get_audit_log(limit=50, table_name='sites', record_id=site_id)
            if history:
                rows = []
                for entry in history:
                    if entry['action'] == 'update':
                        changes = ', '.join(
                            f"{k}: {entry['old_values'].get(k)!r} → {v!r}"
                            for k, v in (entry['new_values'] or {}).items()
                        )
                    elif entry['action'] == 'create':
                        changes = 'Site created'
                    else:
                        changes = entry['action'].title()
                    rows.append({'When': ui.fmt_datetime(entry['timestamp']), 'Action': entry['action'], 'Changes': changes})
                st.dataframe(pd.DataFrame(rows), width='stretch', hide_index=True)
            else:
                st.caption('No changes recorded for this site yet.')

# ======================================================================
# Create new site
# ======================================================================
else:
    ui.setup_page('Add New Site', '➕', 'Create a new site entry')
    if st.button('← Sites'):
        ui.go_to_sites()
    st.markdown('---')

    submitted, cancelled, values = site_form(None, 'create_site_form')
    if cancelled:
        ui.go_to_sites()
    if submitted:
        clean, errors, warnings = validate_for_form(values, exclude_id=None)
        if errors:
            ui.show_errors(errors)
        else:
            try:
                new_site = db.create_site(**clean)
            except ValidationError as exc:
                ui.show_errors(exc.errors)
            else:
                st.toast(f"Created {new_site['name']}", icon='✅')
                if warnings:
                    st.session_state['post_create_warnings'] = warnings
                ui.go_to_site(new_site['id'])
