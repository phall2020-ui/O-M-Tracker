"""
Import Data page - import sites from Excel spreadsheet.
Supports the same Excel format as the legacy system.
"""

import streamlit as st
import pandas as pd
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db

st.set_page_config(
    page_title="Import Data - Clearsol O&M",
    page_icon="⚡",
    layout="wide",
)

# Page Header
st.title("📤 Import Data")
st.caption("Import sites from Excel spreadsheet")

st.markdown("---")

# Import Section
st.subheader("Import from Excel")
st.markdown("""
Upload your Clearsol O&M Framework Tracker spreadsheet to import site data.
The importer will read the "Portfolio Tracker" tab.
""")

# File upload
uploaded_file = st.file_uploader(
    "Choose an Excel file",
    type=['xlsx', 'xls'],
    help="Select your Clearsol O&M Framework Tracker spreadsheet"
)

if uploaded_file is not None:
    st.success(f"📁 File selected: **{uploaded_file.name}**")
    
    # Preview and Import buttons
    col1, col2 = st.columns(2)
    
    with col1:
        preview_clicked = st.button("👁️ Preview Data", use_container_width=True)
    with col2:
        import_clicked = st.button("📥 Import Sites", type="primary", use_container_width=True)
    
    # Try to read the Excel file
    try:
        import openpyxl
        
        # Read the file
        xlsx = pd.ExcelFile(uploaded_file)
        
        # Check for Portfolio Tracker sheet
        if 'Portfolio Tracker' not in xlsx.sheet_names:
            st.error("❌ 'Portfolio Tracker' sheet not found in the Excel file.")
            st.info(f"Available sheets: {', '.join(xlsx.sheet_names)}")
        else:
            # Read the Portfolio Tracker sheet
            df = pd.read_excel(xlsx, sheet_name='Portfolio Tracker', header=None)
            
            # Parse sites from rows 5-68 (index 4-67)
            sites_data = []
            
            for row_idx in range(4, min(68, len(df))):
                row = df.iloc[row_idx]
                
                # Column C (index 2) = Site Name
                site_name = row.iloc[2] if len(row) > 2 else None
                
                if pd.isna(site_name) or not isinstance(site_name, str):
                    continue
                
                # Parse fields
                system_size = float(row.iloc[3]) if len(row) > 3 and pd.notna(row.iloc[3]) else 0
                contract_val = row.iloc[4] if len(row) > 4 else None
                onboard_date_raw = row.iloc[5] if len(row) > 5 else None
                pm_cost = float(row.iloc[6]) if len(row) > 6 and pd.notna(row.iloc[6]) else 0
                cctv_cost = float(row.iloc[7]) if len(row) > 7 and pd.notna(row.iloc[7]) else 0
                cleaning_cost = float(row.iloc[8]) if len(row) > 8 and pd.notna(row.iloc[8]) else 0
                spv_code = row.iloc[21] if len(row) > 21 and pd.notna(row.iloc[21]) else None  # Column V
                
                # Parse onboard date
                onboard_date = None
                if pd.notna(onboard_date_raw):
                    if isinstance(onboard_date_raw, datetime):
                        onboard_date = onboard_date_raw.strftime('%Y-%m-%d')
                    elif isinstance(onboard_date_raw, str):
                        onboard_date = onboard_date_raw
                
                # Determine contract status
                contract_status = 'Yes' if contract_val == 'Yes' else 'No'
                
                # Get SPV info
                spv = db.get_spv_by_code(spv_code) if spv_code else None
                
                sites_data.append({
                    'name': site_name,
                    'system_size_kwp': system_size,
                    'site_type': 'Rooftop',
                    'contract_status': contract_status,
                    'onboard_date': onboard_date,
                    'pm_cost': pm_cost,
                    'cctv_cost': cctv_cost,
                    'cleaning_cost': cleaning_cost,
                    'spv_id': spv['id'] if spv else None,
                    'spv_code': spv_code,
                    'source_sheet': 'Portfolio Tracker',
                    'source_row': row_idx + 1,  # Excel row number (1-indexed)
                })
            
            if preview_clicked:
                st.markdown("---")
                st.subheader("Preview")
                st.write(f"Found **{len(sites_data)}** sites to import:")
                
                if sites_data:
                    df_preview = pd.DataFrame(sites_data)
                    display_cols = ['name', 'system_size_kwp', 'contract_status', 'spv_code', 'pm_cost', 'cctv_cost', 'cleaning_cost']
                    df_display = df_preview[[c for c in display_cols if c in df_preview.columns]].copy()
                    df_display.columns = ['Site Name', 'Size (kWp)', 'Contract', 'SPV', 'PM Cost', 'CCTV', 'Cleaning']
                    
                    st.dataframe(df_display, use_container_width=True, hide_index=True)
                else:
                    st.warning("No valid sites found in the spreadsheet.")
            
            if import_clicked:
                if not sites_data:
                    st.error("❌ No valid sites found to import.")
                else:
                    st.markdown("---")
                    with st.spinner("Importing sites..."):
                        imported = db.import_sites(sites_data)
                    
                    st.success(f"✅ Successfully imported **{len(imported)}** sites!")
                    
                    # Show summary
                    col1, col2 = st.columns(2)
                    with col1:
                        contracted = len([s for s in sites_data if s['contract_status'] == 'Yes'])
                        st.metric("Contracted Sites", contracted)
                    with col2:
                        total_capacity = sum(s['system_size_kwp'] for s in sites_data)
                        st.metric("Total Capacity", f"{total_capacity/1000:,.2f} MW")
                    
                    if st.button("📋 View Imported Sites"):
                        st.switch_page("pages/1_Sites.py")
    
    except ImportError:
        st.error("❌ openpyxl library is required for Excel import. Install with: `pip install openpyxl`")
    except Exception as e:
        st.error(f"❌ Error reading Excel file: {str(e)}")

st.markdown("---")

# Import Requirements
st.subheader("Import Requirements")

st.markdown("""
| Requirement | Details |
|------------|---------|
| **Sheet Name** | Must contain a "Portfolio Tracker" tab |
| **Data Range** | Site data should start from row 5 (rows 1-4 are headers) |
| **Required Columns** | Site Name (C), System Size (D) |
| **Optional Columns** | Contract (E), Onboard Date (F), PM Cost (G), CCTV (H), Cleaning (I), SPV (V) |
""")

st.warning("⚠️ **Important:** Importing will replace all existing site data.")

st.markdown("---")

# Manual Import Alternative
st.subheader("Manual Data Entry")
st.markdown("""
Alternatively, you can add sites manually:
""")

if st.button("➕ Add Site Manually"):
    if 'selected_site_id' in st.session_state:
        del st.session_state['selected_site_id']
    st.switch_page("pages/2_Site_Details.py")

# JSON Import Option
st.markdown("---")
st.subheader("Import from JSON")
st.markdown("Import site data from a JSON file (advanced):")

json_file = st.file_uploader(
    "Upload JSON file",
    type=['json'],
    help="Upload a JSON file containing site data"
)

if json_file is not None:
    try:
        import json
        
        json_data = json.load(json_file)
        
        if isinstance(json_data, list):
            st.success(f"📁 Found **{len(json_data)}** sites in JSON file")
            
            if st.button("📥 Import from JSON", type="primary"):
                # Transform JSON data to match our format
                sites_data = []
                for item in json_data:
                    # Handle both camelCase and snake_case keys
                    sites_data.append({
                        'name': item.get('name', ''),
                        'system_size_kwp': item.get('systemSizeKwp', item.get('system_size_kwp', 0)),
                        'site_type': item.get('siteType', item.get('site_type', 'Rooftop')),
                        'contract_status': item.get('contractStatus', item.get('contract_status', 'No')),
                        'onboard_date': item.get('onboardDate', item.get('onboard_date')),
                        'pm_cost': item.get('pmCost', item.get('pm_cost', 0)),
                        'cctv_cost': item.get('cctvCost', item.get('cctv_cost', 0)),
                        'cleaning_cost': item.get('cleaningCost', item.get('cleaning_cost', 0)),
                        'spv_id': item.get('spvId', item.get('spv_id')),
                        'spv_code': item.get('spvCode', item.get('spv_code')),
                        'source_sheet': item.get('sourceSheet', item.get('source_sheet')),
                        'source_row': item.get('sourceRow', item.get('source_row')),
                    })
                
                imported = db.import_sites(sites_data)
                st.success(f"✅ Successfully imported **{len(imported)}** sites from JSON!")
                
                if st.button("📋 View Imported Sites", key="view_json_import"):
                    st.switch_page("pages/1_Sites.py")
        else:
            st.error("JSON file should contain an array of site objects.")
    
    except json.JSONDecodeError as e:
        st.error(f"❌ Invalid JSON file: {str(e)}")
    except Exception as e:
        st.error(f"❌ Error processing JSON file: {str(e)}")
