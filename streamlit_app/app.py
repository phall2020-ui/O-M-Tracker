"""
Clearsol O&M Portfolio Tracker - Streamlit Application
Main entry point and Dashboard page.
"""

import streamlit as st
import db
import calculations

# Page configuration
st.set_page_config(
    page_title="Clearsol O&M Portfolio Tracker",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS to match the original app's styling
st.markdown("""
<style>
    /* Sidebar styling */
    [data-testid="stSidebar"] {
        background-color: #111827;
    }
    [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
        color: #9CA3AF;
    }
    [data-testid="stSidebar"] .stButton button {
        background-color: transparent;
        color: #9CA3AF;
        border: none;
        text-align: left;
        width: 100%;
        padding: 0.5rem 1rem;
    }
    [data-testid="stSidebar"] .stButton button:hover {
        background-color: #1F2937;
        color: white;
    }
    
    /* Card-like containers */
    .metric-card {
        background-color: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        border: 1px solid #E5E7EB;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    
    /* Header styling */
    .page-header {
        padding-bottom: 1rem;
        border-bottom: 1px solid #E5E7EB;
        margin-bottom: 1.5rem;
    }
    
    /* Badge styling */
    .badge {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        border-radius: 0.375rem;
        font-size: 0.75rem;
        font-weight: 500;
    }
    .badge-success {
        background-color: #D1FAE5;
        color: #065F46;
    }
    .badge-info {
        background-color: #DBEAFE;
        color: #1E40AF;
    }
    .badge-default {
        background-color: #F3F4F6;
        color: #374151;
    }
</style>
""", unsafe_allow_html=True)

# Sidebar branding
with st.sidebar:
    st.markdown("### ⚡ Clearsol O&M")
    st.markdown("---")
    st.markdown("""
    **Portfolio Tracker v2.0**
    
    *Streamlit Edition*
    """)

# Main Dashboard Content
st.markdown('<div class="page-header">', unsafe_allow_html=True)
st.title("📊 Dashboard")
st.caption("Portfolio Overview")
st.markdown('</div>', unsafe_allow_html=True)

# Load data
sites = db.get_sites()
summary = calculations.calculate_portfolio_summary(sites)

# Stats Cards Row
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric(
        label="🏢 Total Sites",
        value=summary['total_sites'],
        delta=f"{summary['contracted_sites']} contracted"
    )

with col2:
    total_mw = summary['total_capacity_kwp'] / 1000
    contracted_mw = summary['contracted_capacity_kwp'] / 1000
    st.metric(
        label="⚡ Total Capacity",
        value=f"{total_mw:,.1f} MW",
        delta=f"{contracted_mw:,.1f} MW contracted"
    )

with col3:
    st.metric(
        label="💷 Monthly Revenue",
        value=calculations.format_currency(summary['total_monthly_fee']),
        delta="From contracted sites"
    )

with col4:
    st.metric(
        label="📅 Current Tier",
        value=summary['current_tier'],
        delta=f"{summary['corrective_days_allowed']:.1f} corrective days/mo"
    )

st.markdown("---")

# Two column layout for additional info
col_left, col_right = st.columns(2)

with col_left:
    st.subheader("Sites by SPV")
    
    if summary['sites_by_spv']:
        # Sort by count descending
        sorted_spvs = sorted(
            summary['sites_by_spv'].items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        for spv_code, count in sorted_spvs:
            cols = st.columns([3, 1])
            with cols[0]:
                st.markdown(f'<span class="badge badge-info">{spv_code}</span>', unsafe_allow_html=True)
            with cols[1]:
                st.write(f"**{count}** sites")
    else:
        st.info("No sites imported yet. Go to **Import Data** to get started.")

with col_right:
    st.subheader("Quick Actions")
    
    st.markdown("""
    📋 **[View All Sites](/Sites)**  
    Browse and manage your portfolio sites
    
    ➕ **[Add New Site](/Site_Details)**  
    Create a new site entry manually
    
    📤 **[Import from Excel](/Import_Data)**  
    Bulk import sites from your spreadsheet
    """)

# Footer with version info
st.markdown("---")
st.caption("Portfolio Tracker v2.0 | Streamlit Edition | Clearsol O&M")
