"""
Site Details page - view and edit individual site information.
Includes calculated fee breakdowns by tier.
"""

import streamlit as st
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db
import calculations

st.set_page_config(
    page_title="Site Details - Clearsol O&M",
    page_icon="⚡",
    layout="wide",
)

# Get site ID from session state or show create form
site_id = st.session_state.get('selected_site_id')
edit_mode = st.session_state.get('edit_mode', False)

# Load SPVs for dropdown
spvs = db.get_spvs()
spv_options = {spv['code']: f"{spv['code']} - {spv['name']}" for spv in spvs}
spv_options_with_none = {'': '-- None --', **spv_options}

if site_id:
    # Load existing site
    site = db.get_site_by_id(site_id)
    
    if not site:
        st.error("Site not found")
        if st.button("← Back to Sites"):
            del st.session_state['selected_site_id']
            st.switch_page("pages/1_Sites.py")
        st.stop()
    
    site_with_calcs = calculations.calculate_site_with_all_tiers(site)
    
    # Page Header
    if edit_mode:
        st.title("✏️ Edit Site")
        st.caption(site['name'])
    else:
        st.title(f"📍 {site['name']}")
        st.caption(f"{site.get('site_type', 'Rooftop')} • {site.get('system_size_kwp', 0):,.2f} kWp")
    
    # Navigation
    col1, col2 = st.columns([1, 4])
    with col1:
        if st.button("← Back to Sites"):
            if 'selected_site_id' in st.session_state:
                del st.session_state['selected_site_id']
            if 'edit_mode' in st.session_state:
                del st.session_state['edit_mode']
            st.switch_page("pages/1_Sites.py")
    
    if not edit_mode:
        # Action buttons
        col_actions = st.columns([1, 1, 4])
        with col_actions[0]:
            if st.button("✏️ Edit", use_container_width=True):
                st.session_state['edit_mode'] = True
                st.rerun()
        with col_actions[1]:
            if st.button("🗑️ Delete", type="secondary", use_container_width=True):
                st.session_state['confirm_delete'] = True
        
        # Delete confirmation
        if st.session_state.get('confirm_delete'):
            st.warning(f"⚠️ Are you sure you want to delete '{site['name']}'?")
            col_del = st.columns(2)
            with col_del[0]:
                if st.button("✅ Yes, Delete", type="primary"):
                    db.delete_site(site_id)
                    del st.session_state['selected_site_id']
                    del st.session_state['confirm_delete']
                    st.success("Site deleted!")
                    st.switch_page("pages/1_Sites.py")
            with col_del[1]:
                if st.button("❌ Cancel"):
                    del st.session_state['confirm_delete']
                    st.rerun()
    
    st.markdown("---")
    
    if edit_mode:
        # Edit form
        with st.form("edit_site_form"):
            st.subheader("Basic Information")
            col1, col2 = st.columns(2)
            
            with col1:
                name = st.text_input("Site Name *", value=site.get('name', ''))
                system_size = st.number_input(
                    "System Size (kWp) *", 
                    min_value=0.0, 
                    value=float(site.get('system_size_kwp', 0)),
                    step=0.01
                )
                site_type = st.selectbox(
                    "Site Type",
                    options=['Rooftop', 'Ground Mount'],
                    index=0 if site.get('site_type') == 'Rooftop' else 1
                )
            
            with col2:
                contract_status = st.selectbox(
                    "Contract Status",
                    options=['Yes', 'No'],
                    index=0 if site.get('contract_status') == 'Yes' else 1
                )
                
                # Handle date
                onboard_date_val = None
                if site.get('onboard_date'):
                    try:
                        onboard_date_val = datetime.strptime(site['onboard_date'][:10], '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        pass
                
                onboard_date = st.date_input(
                    "Onboard Date",
                    value=onboard_date_val
                )
                
                current_spv = site.get('spv_code', '')
                spv_code = st.selectbox(
                    "SPV",
                    options=list(spv_options_with_none.keys()),
                    format_func=lambda x: spv_options_with_none.get(x, x),
                    index=list(spv_options_with_none.keys()).index(current_spv) if current_spv in spv_options_with_none else 0
                )
            
            st.subheader("Site Fixed Costs")
            col1, col2, col3 = st.columns(3)
            
            with col1:
                pm_cost = st.number_input(
                    "PM Cost (£)",
                    min_value=0.0,
                    value=float(site.get('pm_cost', 0)),
                    step=0.01
                )
            with col2:
                cctv_cost = st.number_input(
                    "CCTV Cost (£)",
                    min_value=0.0,
                    value=float(site.get('cctv_cost', 0)),
                    step=0.01
                )
            with col3:
                cleaning_cost = st.number_input(
                    "Cleaning Cost (£)",
                    min_value=0.0,
                    value=float(site.get('cleaning_cost', 0)),
                    step=0.01
                )
            
            # Submit buttons
            col_submit = st.columns([1, 1, 3])
            with col_submit[0]:
                submitted = st.form_submit_button("💾 Save Changes", type="primary")
            with col_submit[1]:
                cancelled = st.form_submit_button("❌ Cancel")
            
            if submitted:
                if not name or system_size <= 0:
                    st.error("Name and System Size are required!")
                else:
                    # Get SPV ID from code
                    spv = db.get_spv_by_code(spv_code) if spv_code else None
                    
                    updated = db.update_site(
                        site_id,
                        name=name,
                        system_size_kwp=system_size,
                        site_type=site_type,
                        contract_status=contract_status,
                        onboard_date=str(onboard_date) if onboard_date else None,
                        pm_cost=pm_cost,
                        cctv_cost=cctv_cost,
                        cleaning_cost=cleaning_cost,
                        spv_id=spv['id'] if spv else None,
                        spv_code=spv_code if spv_code else None
                    )
                    
                    if updated:
                        st.success("Site updated successfully!")
                        st.session_state['edit_mode'] = False
                        st.rerun()
                    else:
                        st.error("Failed to update site")
            
            if cancelled:
                st.session_state['edit_mode'] = False
                st.rerun()
    
    else:
        # View mode - display site details
        col_left, col_right = st.columns(2)
        
        with col_left:
            st.subheader("Basic Information")
            st.markdown(f"""
            | Field | Value |
            |-------|-------|
            | **Site Name** | {site.get('name', '')} |
            | **System Size** | {site.get('system_size_kwp', 0):,.2f} kWp |
            | **Site Type** | {site.get('site_type', 'Rooftop')} |
            | **Contract Status** | {'✅ Yes' if site.get('contract_status') == 'Yes' else '❌ No'} |
            | **Onboard Date** | {site.get('onboard_date', '—') or '—'} |
            | **SPV** | {site.get('spv_code', '—') or '—'} |
            """)
        
        with col_right:
            st.subheader("Site Fixed Costs")
            st.markdown(f"""
            | Cost Type | Amount |
            |-----------|--------|
            | **PM Cost** | £{site.get('pm_cost', 0):,.2f} |
            | **CCTV Cost** | £{site.get('cctv_cost', 0):,.2f} |
            | **Cleaning Cost** | £{site.get('cleaning_cost', 0):,.2f} |
            | **Total Site Costs** | **£{site_with_calcs.get('site_fixed_costs', 0):,.2f}** |
            """)
        
        # Fee Calculations table
        st.markdown("---")
        st.subheader("Fee Calculations by Portfolio Tier")
        
        fee_data = {
            'Metric': ['Portfolio Cost', 'Fixed Fee (£)', 'Fee per kWp (£)'],
            '<20MW': [
                f"£{site_with_calcs.get('portfolio_cost_20mw', 0):,.2f}",
                f"£{site_with_calcs.get('fixed_fee_20mw', 0):,.2f}",
                f"{site_with_calcs.get('fee_per_kwp_20mw', 0):,.2f}" if site_with_calcs.get('fee_per_kwp_20mw', 0) > 0 else "—"
            ],
            '20-30MW': [
                f"£{site_with_calcs.get('portfolio_cost_30mw', 0):,.2f}",
                f"£{site_with_calcs.get('fixed_fee_30mw', 0):,.2f}",
                f"{site_with_calcs.get('fee_per_kwp_30mw', 0):,.2f}" if site_with_calcs.get('fee_per_kwp_30mw', 0) > 0 else "—"
            ],
            '30-40MW': [
                f"£{site_with_calcs.get('portfolio_cost_40mw', 0):,.2f}",
                f"£{site_with_calcs.get('fixed_fee_40mw', 0):,.2f}",
                f"{site_with_calcs.get('fee_per_kwp_40mw', 0):,.2f}" if site_with_calcs.get('fee_per_kwp_40mw', 0) > 0 else "—"
            ],
        }
        
        st.table(fee_data)
        
        # Monthly fee highlight
        monthly_fee = site_with_calcs.get('monthly_fee', 0)
        st.info(f"**Monthly Fee:** £{monthly_fee:,.2f}" + 
                (" *(Site not contracted)*" if site.get('contract_status') != 'Yes' else ""))

else:
    # Create new site form
    st.title("➕ Add New Site")
    st.caption("Create a new site entry")
    
    if st.button("← Back to Sites"):
        st.switch_page("pages/1_Sites.py")
    
    st.markdown("---")
    
    with st.form("create_site_form"):
        st.subheader("Basic Information")
        col1, col2 = st.columns(2)
        
        with col1:
            name = st.text_input("Site Name *")
            system_size = st.number_input("System Size (kWp) *", min_value=0.0, step=0.01)
            site_type = st.selectbox("Site Type", options=['Rooftop', 'Ground Mount'])
        
        with col2:
            contract_status = st.selectbox("Contract Status", options=['No', 'Yes'])
            onboard_date = st.date_input("Onboard Date", value=None)
            spv_code = st.selectbox(
                "SPV",
                options=list(spv_options_with_none.keys()),
                format_func=lambda x: spv_options_with_none.get(x, x)
            )
        
        st.subheader("Site Fixed Costs")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            pm_cost = st.number_input("PM Cost (£)", min_value=0.0, step=0.01)
        with col2:
            cctv_cost = st.number_input("CCTV Cost (£)", min_value=0.0, step=0.01)
        with col3:
            cleaning_cost = st.number_input("Cleaning Cost (£)", min_value=0.0, step=0.01)
        
        submitted = st.form_submit_button("💾 Create Site", type="primary")
        
        if submitted:
            if not name or system_size <= 0:
                st.error("Name and System Size are required!")
            else:
                # Get SPV ID from code
                spv = db.get_spv_by_code(spv_code) if spv_code else None
                
                new_site = db.create_site(
                    name=name,
                    system_size_kwp=system_size,
                    site_type=site_type,
                    contract_status=contract_status,
                    onboard_date=str(onboard_date) if onboard_date else None,
                    pm_cost=pm_cost,
                    cctv_cost=cctv_cost,
                    cleaning_cost=cleaning_cost,
                    spv_id=spv['id'] if spv else None,
                    spv_code=spv_code if spv_code else None
                )
                
                if new_site:
                    st.success(f"Site '{name}' created successfully!")
                    st.session_state['selected_site_id'] = new_site['id']
                    st.session_state['edit_mode'] = False
                    st.rerun()
                else:
                    st.error("Failed to create site")
