"""
Import Data page - import sites from the Framework Tracker spreadsheet or a
JSON export, with a full validated preview before anything is written.
"""

import json
import os
import sys
from datetime import date

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import importer  # noqa: E402
import ui  # noqa: E402
from validation import ValidationError  # noqa: E402

ui.setup_page('Import Data', '📤', 'Bulk-load sites from Excel or JSON')

existing_sites = db.get_sites()
spvs_by_code = db.get_spvs_by_code()

# ---------- Backup ----------
if existing_sites:
    with st.container(border=True):
        b1, b2 = st.columns([3, 1])
        with b1:
            st.markdown(
                f"**{len(existing_sites)} sites** are currently stored. Importing **replaces** them all. "
                'Download a backup first — it can be re-imported via the JSON option below.'
            )
        with b2:
            st.download_button(
                '💾 Backup current sites (JSON)',
                data=json.dumps(existing_sites, indent=2, default=str),
                file_name=f'clearsol_sites_backup_{date.today().isoformat()}.json',
                mime='application/json',
                width='stretch',
            )


def render_preview_and_import(result: importer.ImportResult, source_label: str, key: str) -> None:
    """Shared preview + import flow for Excel and JSON."""
    if result.file_errors:
        for message in result.file_errors:
            st.error(message)
        return

    stats = result.summary()
    st.subheader('Preview')
    p1, p2, p3, p4, p5 = st.columns(5)
    p1.metric('Rows found', stats['rows_found'])
    p2.metric('Ready to import', stats['valid'])
    p3.metric('Rows with errors', stats['with_errors'])
    p4.metric('Rows with warnings', stats['with_warnings'])
    p5.metric('Contracted capacity', ui.mw(sum(
        s['system_size_kwp'] for s in result.valid_sites if s['contract_status'] == 'Yes'
    )))

    if result.skipped_rows:
        with st.expander(f'{len(result.skipped_rows)} row(s) skipped'):
            st.dataframe(
                pd.DataFrame(result.skipped_rows, columns=['Row', 'Reason']),
                width='stretch', hide_index=True,
            )

    if not result.rows:
        st.warning('No site rows were found.')
        return

    preview = result.preview_frame()
    show_only_issues = st.toggle('Show only rows with issues', value=stats['with_errors'] > 0, key=f'{key}_issues')
    if show_only_issues:
        preview = preview[preview['Status'] != 'OK']
    st.dataframe(
        preview,
        width='stretch',
        hide_index=True,
        column_config={
            'Row': st.column_config.NumberColumn(width='small', format='%d'),
            'Status': st.column_config.TextColumn(width='small'),
            'Size (kWp)': st.column_config.NumberColumn(format='%,.2f'),
            'PM Cost': st.column_config.NumberColumn(format='£%,.2f'),
            'CCTV Cost': st.column_config.NumberColumn(format='£%,.2f'),
            'Cleaning Cost': st.column_config.NumberColumn(format='£%,.2f'),
            'Issues': st.column_config.TextColumn(width='large'),
        },
    )

    if stats['with_errors']:
        st.error(
            f"{stats['with_errors']} row(s) have errors and cannot be imported as-is. "
            'Fix them in the spreadsheet, or tick the option below to import only the valid rows.'
        )
        skip_errors = st.checkbox(
            f"Skip the {stats['with_errors']} row(s) with errors and import the {stats['valid']} valid rows",
            key=f'{key}_skip',
        )
    else:
        skip_errors = True

    if stats['with_warnings']:
        st.info(
            f"{stats['with_warnings']} row(s) have warnings (e.g. unknown SPV, missing onboard date). "
            'They will import, and the issues will appear on the dashboard data-quality panel.'
        )

    can_import = stats['valid'] > 0 and (stats['with_errors'] == 0 or skip_errors)
    confirm = True
    if existing_sites:
        confirm = st.checkbox(
            f'I understand this will replace the {len(existing_sites)} existing sites', key=f'{key}_confirm'
        )

    if st.button(
        f"📥 Import {stats['valid']} sites from {source_label}",
        type='primary',
        disabled=not (can_import and confirm),
        key=f'{key}_import',
    ):
        try:
            with st.spinner('Importing…'):
                imported = db.import_sites(result.valid_sites, replace=True)
        except ValidationError as exc:
            ui.show_errors(exc.errors, 'Import aborted — nothing was changed:')
        else:
            st.success(f'Imported **{len(imported)}** sites. Existing data was replaced in a single transaction.')
            st.balloons()
            s1, s2, s3 = st.columns(3)
            s1.metric('Sites', len(imported))
            s2.metric('Contracted', sum(1 for s in imported if s['contract_status'] == 'Yes'))
            s3.metric('Total capacity', ui.mw(sum(s['system_size_kwp'] for s in imported)))
            st.page_link('pages/1_Sites.py', label='View imported sites', icon='📋')
            st.page_link('app.py', label='Check data quality on the dashboard', icon='📊')


# ---------- Excel ----------
st.subheader('Import from Excel')
st.markdown(
    'Upload the **Clearsol O&M Framework Tracker** workbook. The importer reads the '
    f'"{importer.SHEET_NAME}" tab, starting at row {importer.FIRST_DATA_ROW}, and stops at the end of the site block.'
)

uploaded = st.file_uploader('Choose an Excel file', type=['xlsx', 'xlsm', 'xls'], key='excel_upload')

if uploaded is not None:
    with st.expander('Advanced: row range'):
        r1, r2 = st.columns(2)
        with r1:
            first_row = st.number_input('First data row', min_value=1, value=importer.FIRST_DATA_ROW, step=1)
        with r2:
            last_row = st.number_input('Last data row (0 = auto-detect)', min_value=0, value=0, step=1)
    result = importer.parse_workbook(
        uploaded, spvs_by_code, first_row=int(first_row), last_row=int(last_row) or None
    )
    render_preview_and_import(result, uploaded.name, key='excel')

with st.expander('Spreadsheet layout expected'):
    st.markdown(
        f"""
| Requirement | Details |
|------------|---------|
| **Sheet name** | Must contain a "{importer.SHEET_NAME}" tab |
| **Data range** | Sites start at row {importer.FIRST_DATA_ROW}; the importer scans down until the block ends |
| **Required columns** | Site Name (C), System Size kWp (D) |
| **Optional columns** | Contract Yes/No (E), Onboard Date (F), PM Cost (G), CCTV (H), Cleaning (I), SPV code (V) |
| **Accepted values** | Contract: Yes/No/Y/N/True/False · Dates: Excel dates or DD/MM/YYYY · Costs: numbers, "£1,250" |
"""
    )

st.markdown('---')

# ---------- JSON ----------
st.subheader('Import from JSON')
st.caption('Restore a backup downloaded from this page, or load an export from the legacy Next.js app (camelCase keys are accepted).')
json_file = st.file_uploader('Upload JSON file', type=['json'], key='json_upload')

if json_file is not None:
    try:
        payload = json.load(json_file)
    except json.JSONDecodeError as exc:
        st.error(f'Invalid JSON file: {exc}')
    else:
        result = importer.parse_json_sites(payload, spvs_by_code)
        render_preview_and_import(result, json_file.name, key='json')

st.markdown('---')

# ---------- Manual ----------
st.subheader('Manual entry')
if st.button('➕ Add a site manually'):
    ui.go_to_new_site()
