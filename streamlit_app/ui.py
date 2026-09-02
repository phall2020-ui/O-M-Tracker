"""
Shared UI helpers: page setup, sidebar navigation, formatting and
navigation state so every page looks and behaves the same way.
"""

from __future__ import annotations

import io
from datetime import date, datetime
from typing import Optional

import pandas as pd
import streamlit as st

APP_VERSION = '2.1'

PAGES = [
    ('app.py', 'Dashboard', '📊'),
    ('pages/1_Sites.py', 'Sites', '🏢'),
    ('pages/2_Site_Details.py', 'Site Details', '📍'),
    ('pages/3_SPVs.py', 'SPVs', '🏦'),
    ('pages/6_CM_Days.py', 'CM Days', '🛠️'),
    ('pages/5_Import_Data.py', 'Import Data', '📤'),
    ('pages/4_Rate_Tiers.py', 'Settings', '⚙️'),
    ('pages/7_Audit_Log.py', 'Audit Log', '📋'),
]

_HIDE_DEFAULT_NAV_CSS = """
<style>
    /* Hide Streamlit's auto-generated page list; we render our own nav */
    [data-testid="stSidebarNav"] { display: none; }
</style>
"""

_CSS = """
<style>
    [data-testid="stSidebar"] { background-color: #111827; }
    [data-testid="stSidebar"] * { color: #D1D5DB; }
    [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] {
        border-radius: 0.375rem;
        padding: 0.35rem 0.6rem;
    }
    [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"]:hover {
        background-color: #1F2937;
    }
    [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] p { color: #E5E7EB; }
    [data-testid="stSidebar"] hr { border-color: #374151; }

    /* Metric cards */
    [data-testid="stMetric"] {
        background-color: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 0.5rem;
        padding: 0.9rem 1rem;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    [data-testid="stMetricLabel"] p { color: #6B7280; font-size: 0.85rem; }

    /* Badges */
    .badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1.2;
    }
    .badge-success { background-color: #D1FAE5; color: #065F46; }
    .badge-info { background-color: #DBEAFE; color: #1E40AF; }
    .badge-warning { background-color: #FEF3C7; color: #92400E; }
    .badge-danger { background-color: #FEE2E2; color: #991B1B; }
    .badge-default { background-color: #F3F4F6; color: #374151; }

    .page-subtitle { color: #6B7280; margin-top: -0.75rem; margin-bottom: 1rem; }
</style>
"""


# ============ Page chrome ============

def setup_page(title: str, icon: str = '⚡', subtitle: Optional[str] = None) -> None:
    """Call first on every page: configures the page, CSS and sidebar."""
    st.set_page_config(
        page_title=f'{title} - Clearsol O&M',
        page_icon=icon,
        layout='wide',
        initial_sidebar_state='expanded',
    )
    st.markdown(_CSS, unsafe_allow_html=True)
    _render_sidebar()
    st.title(f'{icon} {title}')
    if subtitle:
        st.markdown(f'<p class="page-subtitle">{subtitle}</p>', unsafe_allow_html=True)


def _render_sidebar() -> None:
    with st.sidebar:
        st.markdown('### ⚡ Clearsol O&M')
        st.caption(f'Portfolio Tracker v{APP_VERSION}')
        st.markdown('---')
        nav = st.container()
        try:
            with nav:
                for path, label, icon in PAGES:
                    st.page_link(path, label=label, icon=icon)
        except Exception:
            # Page files could not be resolved (e.g. a page run directly as the
            # entrypoint) — keep Streamlit's default navigation visible instead.
            nav.empty()
        else:
            st.markdown(_HIDE_DEFAULT_NAV_CSS, unsafe_allow_html=True)
        st.markdown('---')
        _render_sidebar_summary()


def _render_sidebar_summary() -> None:
    try:
        import db
        import calculations
        sites = db.get_sites()
        summary = calculations.calculate_portfolio_summary(sites)
        st.caption(
            f"**{summary['total_sites']}** sites · "
            f"**{summary['contracted_capacity_kwp'] / 1000:,.1f} MW** contracted · "
            f"tier **{summary['current_tier']}**"
        )
    except Exception:
        st.caption('Portfolio summary unavailable')


def badge(text: str, kind: str = 'default') -> str:
    return f'<span class="badge badge-{kind}">{text}</span>'


def contract_badge(status: str) -> str:
    return badge('Contracted', 'success') if status == 'Yes' else badge('Not contracted', 'default')


def show_errors(errors: list[str], title: str = 'Please fix the following:') -> None:
    st.error(title + '\n\n' + '\n'.join(f'- {e}' for e in errors))


def show_warnings(warnings: list[str], title: str = 'Check the following:') -> None:
    st.warning(title + '\n\n' + '\n'.join(f'- {w}' for w in warnings))


# ============ Navigation state ============

SITE_ID_KEY = 'selected_site_id'
EDIT_MODE_KEY = 'edit_mode'


def clear_site_selection() -> None:
    for key in (SITE_ID_KEY, EDIT_MODE_KEY, 'confirm_delete'):
        st.session_state.pop(key, None)


def go_to_new_site() -> None:
    """Open the Site Details page in create mode (clears any stale selection)."""
    clear_site_selection()
    st.switch_page('pages/2_Site_Details.py')


def go_to_site(site_id: str, edit: bool = False) -> None:
    st.session_state[SITE_ID_KEY] = site_id
    st.session_state[EDIT_MODE_KEY] = edit
    st.session_state.pop('confirm_delete', None)
    st.switch_page('pages/2_Site_Details.py')


def go_to_sites() -> None:
    clear_site_selection()
    st.switch_page('pages/1_Sites.py')


# ============ Formatting ============

def money(value: Optional[float], dash_if_zero: bool = False) -> str:
    if value is None or (dash_if_zero and not value):
        return '—'
    return f'£{value:,.2f}'


def number(value: Optional[float], decimals: int = 2, dash_if_zero: bool = False) -> str:
    if value is None or (dash_if_zero and not value):
        return '—'
    return f'{value:,.{decimals}f}'


def mw(value_kwp: Optional[float], decimals: int = 2) -> str:
    if value_kwp is None:
        return '—'
    return f'{value_kwp / 1000:,.{decimals}f} MW'


def fmt_date(value: Optional[str]) -> str:
    """ISO date/datetime string -> DD/MM/YYYY."""
    if not value:
        return '—'
    try:
        return datetime.fromisoformat(str(value)[:19]).strftime('%d/%m/%Y')
    except ValueError:
        return str(value)


def fmt_datetime(value: Optional[str]) -> str:
    if not value:
        return '—'
    try:
        return datetime.fromisoformat(str(value)[:19]).strftime('%d/%m/%Y %H:%M')
    except ValueError:
        return str(value)


def to_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


# ============ Export ============

def dataframe_to_excel_bytes(df: pd.DataFrame, sheet_name: str = 'Sites') -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
        worksheet = writer.sheets[sheet_name]
        for column_cells in worksheet.columns:
            width = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
            worksheet.column_dimensions[column_cells[0].column_letter].width = min(max(10, width + 2), 50)
    return buffer.getvalue()


def export_buttons(df: pd.DataFrame, base_name: str, key: str) -> None:
    """CSV and Excel download buttons side by side."""
    stamp = date.today().isoformat()
    col1, col2 = st.columns(2)
    with col1:
        st.download_button(
            '⬇️ Download CSV',
            data=df.to_csv(index=False).encode('utf-8-sig'),
            file_name=f'{base_name}_{stamp}.csv',
            mime='text/csv',
            width='stretch',
            key=f'{key}_csv',
        )
    with col2:
        st.download_button(
            '⬇️ Download Excel',
            data=dataframe_to_excel_bytes(df),
            file_name=f'{base_name}_{stamp}.xlsx',
            mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            width='stretch',
            key=f'{key}_xlsx',
        )
