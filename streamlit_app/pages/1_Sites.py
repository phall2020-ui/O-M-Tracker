"""
Sites listing page - displays all sites in an interactive table.
Replicates the TanStack Table functionality using st.data_editor.
"""

import streamlit as st
import pandas as pd
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db
import calculations

st.set_page_config(
    page_title="Sites - Clearsol O&M",
    page_icon="⚡",
    layout="wide",
)

# Page Header
st.title("🏢 Sites")

# Load data
sites = db.get_sites()
sites_with_calcs = [calculations.calculate_site_with_all_tiers(s) for s in sites]

st.caption(f"{len(sites)} sites in portfolio")
st.markdown("View and manage all sites in your portfolio")

# Action buttons row
col1, col2 = st.columns([4, 1])
with col2:
    if st.button("➕ Add Site", type="primary", use_container_width=True):
        st.switch_page("pages/2_Site_Details.py")

st.markdown("---")

# Search filter
search = st.text_input("🔍 Search sites...", placeholder="Search by site name...")

# Filter data based on search
filtered_sites = sites_with_calcs
if search:
    search_lower = search.lower()
    filtered_sites = [s for s in sites_with_calcs if search_lower in s.get('name', '').lower()]

# Convert to DataFrame for display
if filtered_sites:
    df = pd.DataFrame(filtered_sites)
    
    # Select and rename columns for display
    display_columns = {
        'name': 'Site Name',
        'system_size_kwp': 'Size (kWp)',
        'contract_status': 'Contract',
        'onboard_date': 'Onboard Date',
        'spv_code': 'SPV',
        'site_fixed_costs': 'Site Costs',
        'fixed_fee_20mw': 'Fixed Fee (<20MW)',
        'fee_per_kwp_20mw': '£/kWp (<20MW)',
        'monthly_fee': 'Monthly Fee',
    }
    
    # Only include columns that exist
    cols_to_display = [c for c in display_columns.keys() if c in df.columns]
    df_display = df[['id'] + cols_to_display].copy()
    
    # Rename columns
    df_display = df_display.rename(columns=display_columns)
    
    # Format numeric columns
    if 'Site Costs' in df_display.columns:
        df_display['Site Costs'] = df_display['Site Costs'].apply(lambda x: f"£{x:,.2f}" if pd.notna(x) else "—")
    if 'Fixed Fee (<20MW)' in df_display.columns:
        df_display['Fixed Fee (<20MW)'] = df_display['Fixed Fee (<20MW)'].apply(lambda x: f"£{x:,.2f}" if pd.notna(x) else "—")
    if '£/kWp (<20MW)' in df_display.columns:
        df_display['£/kWp (<20MW)'] = df_display['£/kWp (<20MW)'].apply(lambda x: f"{x:,.2f}" if pd.notna(x) and x > 0 else "—")
    if 'Monthly Fee' in df_display.columns:
        df_display['Monthly Fee'] = df_display['Monthly Fee'].apply(lambda x: f"£{x:,.2f}" if pd.notna(x) and x > 0 else "—")
    if 'Size (kWp)' in df_display.columns:
        df_display['Size (kWp)'] = df_display['Size (kWp)'].apply(lambda x: f"{x:,.2f}" if pd.notna(x) else "—")
    if 'Onboard Date' in df_display.columns:
        df_display['Onboard Date'] = df_display['Onboard Date'].apply(
            lambda x: pd.to_datetime(x).strftime('%d/%m/%Y') if pd.notna(x) and x else "—"
        )
    if 'SPV' in df_display.columns:
        df_display['SPV'] = df_display['SPV'].fillna('—')
    
    # Store IDs for selection handling
    site_ids = df_display['id'].tolist()
    
    # Remove ID column from display but keep for reference
    df_display_final = df_display.drop(columns=['id'])
    
    # Display the dataframe
    st.dataframe(
        df_display_final,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Site Name": st.column_config.TextColumn(width="medium"),
            "Contract": st.column_config.TextColumn(width="small"),
            "SPV": st.column_config.TextColumn(width="small"),
        }
    )
    
    st.markdown("---")
    
    # Site selection for viewing details
    st.subheader("View Site Details")
    
    site_names = {s['id']: s['name'] for s in filtered_sites}
    selected_site_name = st.selectbox(
        "Select a site to view details:",
        options=[""] + [s['name'] for s in filtered_sites],
        format_func=lambda x: x if x else "-- Select a site --"
    )
    
    if selected_site_name:
        selected_site = next((s for s in filtered_sites if s['name'] == selected_site_name), None)
        if selected_site:
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("👁️ View Details", use_container_width=True):
                    st.session_state['selected_site_id'] = selected_site['id']
                    st.switch_page("pages/2_Site_Details.py")
            with col2:
                if st.button("✏️ Edit Site", use_container_width=True):
                    st.session_state['selected_site_id'] = selected_site['id']
                    st.session_state['edit_mode'] = True
                    st.switch_page("pages/2_Site_Details.py")
            with col3:
                if st.button("🗑️ Delete Site", type="secondary", use_container_width=True):
                    st.session_state['delete_site_id'] = selected_site['id']
                    st.session_state['delete_site_name'] = selected_site['name']
    
    # Handle delete confirmation
    if 'delete_site_id' in st.session_state:
        st.warning(f"⚠️ Are you sure you want to delete '{st.session_state.get('delete_site_name', '')}'?")
        col1, col2 = st.columns(2)
        with col1:
            if st.button("✅ Yes, Delete", type="primary"):
                db.delete_site(st.session_state['delete_site_id'])
                del st.session_state['delete_site_id']
                del st.session_state['delete_site_name']
                st.success("Site deleted successfully!")
                st.rerun()
        with col2:
            if st.button("❌ Cancel"):
                del st.session_state['delete_site_id']
                del st.session_state['delete_site_name']
                st.rerun()
    
    # Summary footer
    st.markdown("---")
    st.caption(f"Showing {len(filtered_sites)} of {len(sites)} sites")
    
else:
    st.info("No sites found. Import your data or add a new site.")
    if st.button("➕ Add New Site"):
        st.switch_page("pages/2_Site_Details.py")
