"""
SPVs page - displays all Special Purpose Vehicles.
Shows SPV list and their associated sites.
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
    page_title="SPVs - Clearsol O&M",
    page_icon="⚡",
    layout="wide",
)

# Page Header
st.title("🏦 SPVs")
st.caption("Special Purpose Vehicles")

st.markdown("View and manage Special Purpose Vehicles in your portfolio")
st.markdown("---")

# Load data
spvs = db.get_spvs()
sites = db.get_sites()

# Create summary by SPV
spv_summary = {}
for spv in spvs:
    spv_sites = [s for s in sites if s.get('spv_code') == spv['code']]
    contracted_sites = [s for s in spv_sites if s.get('contract_status') == 'Yes']
    
    total_capacity = sum(s.get('system_size_kwp', 0) for s in spv_sites)
    contracted_capacity = sum(s.get('system_size_kwp', 0) for s in contracted_sites)
    
    # Calculate total monthly fees for contracted sites
    sites_with_calcs = [calculations.calculate_site_with_all_tiers(s) for s in contracted_sites]
    total_monthly = sum(s.get('monthly_fee', 0) for s in sites_with_calcs)
    
    spv_summary[spv['code']] = {
        'code': spv['code'],
        'name': spv['name'],
        'total_sites': len(spv_sites),
        'contracted_sites': len(contracted_sites),
        'total_capacity_kwp': total_capacity,
        'contracted_capacity_kwp': contracted_capacity,
        'total_monthly_fee': total_monthly,
    }

# Display SPV cards
st.subheader("SPV Overview")

if spv_summary:
    # Convert to DataFrame
    df_summary = pd.DataFrame(spv_summary.values())
    
    # Format for display
    df_display = df_summary.copy()
    df_display['Total Sites'] = df_display['total_sites'].astype(str) + ' (' + df_display['contracted_sites'].astype(str) + ' contracted)'
    df_display['Total Capacity'] = df_display['total_capacity_kwp'].apply(lambda x: f"{x/1000:,.2f} MW")
    df_display['Contracted Capacity'] = df_display['contracted_capacity_kwp'].apply(lambda x: f"{x/1000:,.2f} MW")
    df_display['Monthly Revenue'] = df_display['total_monthly_fee'].apply(lambda x: f"£{x:,.2f}")
    
    # Select columns for display
    df_final = df_display[['code', 'name', 'Total Sites', 'Total Capacity', 'Contracted Capacity', 'Monthly Revenue']]
    df_final.columns = ['SPV Code', 'SPV Name', 'Sites', 'Total Capacity', 'Contracted', 'Monthly Revenue']
    
    st.dataframe(
        df_final,
        use_container_width=True,
        hide_index=True,
        column_config={
            "SPV Code": st.column_config.TextColumn(width="small"),
            "SPV Name": st.column_config.TextColumn(width="medium"),
        }
    )
else:
    st.info("No SPVs configured.")

st.markdown("---")

# SPV Detail View
st.subheader("SPV Details")

selected_spv = st.selectbox(
    "Select an SPV to view details:",
    options=[''] + [spv['code'] for spv in spvs],
    format_func=lambda x: f"{x} - {spv_summary.get(x, {}).get('name', '')}" if x else "-- Select an SPV --"
)

if selected_spv:
    spv_data = spv_summary.get(selected_spv, {})
    spv_info = next((s for s in spvs if s['code'] == selected_spv), {})
    
    # Summary metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric(
            "Total Sites",
            spv_data.get('total_sites', 0),
            f"{spv_data.get('contracted_sites', 0)} contracted"
        )
    
    with col2:
        st.metric(
            "Total Capacity",
            f"{spv_data.get('total_capacity_kwp', 0)/1000:,.2f} MW"
        )
    
    with col3:
        st.metric(
            "Contracted Capacity",
            f"{spv_data.get('contracted_capacity_kwp', 0)/1000:,.2f} MW"
        )
    
    with col4:
        st.metric(
            "Monthly Revenue",
            f"£{spv_data.get('total_monthly_fee', 0):,.2f}"
        )
    
    st.markdown("---")
    
    # Sites in this SPV
    st.subheader(f"Sites in {selected_spv}")
    
    spv_sites = [s for s in sites if s.get('spv_code') == selected_spv]
    
    if spv_sites:
        sites_with_calcs = [calculations.calculate_site_with_all_tiers(s) for s in spv_sites]
        
        df_sites = pd.DataFrame(sites_with_calcs)
        
        # Select and format columns
        display_cols = ['name', 'system_size_kwp', 'contract_status', 'monthly_fee']
        df_sites_display = df_sites[[c for c in display_cols if c in df_sites.columns]].copy()
        
        df_sites_display.columns = ['Site Name', 'Size (kWp)', 'Contract', 'Monthly Fee']
        df_sites_display['Size (kWp)'] = df_sites_display['Size (kWp)'].apply(lambda x: f"{x:,.2f}")
        df_sites_display['Monthly Fee'] = df_sites_display['Monthly Fee'].apply(
            lambda x: f"£{x:,.2f}" if x > 0 else "—"
        )
        
        st.dataframe(df_sites_display, use_container_width=True, hide_index=True)
    else:
        st.info(f"No sites assigned to {selected_spv}")

# Unassigned sites section
st.markdown("---")
st.subheader("Unassigned Sites")

unassigned_sites = [s for s in sites if not s.get('spv_code')]

if unassigned_sites:
    st.warning(f"⚠️ {len(unassigned_sites)} site(s) without an SPV assignment")
    
    df_unassigned = pd.DataFrame(unassigned_sites)
    display_cols = ['name', 'system_size_kwp', 'contract_status']
    df_display = df_unassigned[[c for c in display_cols if c in df_unassigned.columns]].copy()
    df_display.columns = ['Site Name', 'Size (kWp)', 'Contract']
    df_display['Size (kWp)'] = df_display['Size (kWp)'].apply(lambda x: f"{x:,.2f}")
    
    st.dataframe(df_display, use_container_width=True, hide_index=True)
else:
    st.success("✅ All sites have an SPV assignment")
