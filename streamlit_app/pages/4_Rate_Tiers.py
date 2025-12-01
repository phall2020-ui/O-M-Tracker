"""
Rate Tiers / Settings page - manage portfolio rate tiers.
Allows viewing and editing of rate tier configuration.
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
    page_title="Rate Tiers - Clearsol O&M",
    page_icon="⚡",
    layout="wide",
)

# Page Header
st.title("⚙️ Settings")
st.caption("Configure portfolio settings")

st.markdown("---")

# Rate Tiers Section
st.subheader("Rate Tiers")
st.markdown("Current portfolio cost rates by capacity tier.")

# Load rate tiers
tiers = db.get_rate_tiers()

if tiers:
    # Create editable dataframe
    df_tiers = pd.DataFrame(tiers)
    
    # Format for display
    df_display = df_tiers[['tier_name', 'min_capacity_mw', 'max_capacity_mw', 'rate_per_kwp']].copy()
    df_display.columns = ['Tier', 'Min Capacity (MW)', 'Max Capacity (MW)', 'Rate (£/kWp)']
    
    # Format max capacity (handle None/null)
    df_display['Max Capacity (MW)'] = df_display['Max Capacity (MW)'].apply(
        lambda x: f"{x:.0f}" if pd.notna(x) else "∞"
    )
    df_display['Min Capacity (MW)'] = df_display['Min Capacity (MW)'].apply(lambda x: f"{x:.0f}")
    df_display['Rate (£/kWp)'] = df_display['Rate (£/kWp)'].apply(lambda x: f"£{x:.2f}")
    
    st.table(df_display)
    
    # Rate editing section
    st.markdown("---")
    st.subheader("Edit Rate Tiers")
    st.markdown("Adjust the rate per kWp for each tier:")
    
    # Create edit form
    with st.form("edit_rates_form"):
        new_rates = {}
        cols = st.columns(len(tiers))
        
        for i, tier in enumerate(tiers):
            with cols[i]:
                new_rate = st.number_input(
                    f"{tier['tier_name']}",
                    min_value=0.0,
                    max_value=100.0,
                    value=float(tier['rate_per_kwp']),
                    step=0.01,
                    format="%.2f",
                    key=f"rate_{tier['id']}"
                )
                new_rates[tier['id']] = new_rate
        
        submitted = st.form_submit_button("💾 Save Changes", type="primary")
        
        if submitted:
            success = True
            for tier_id, rate in new_rates.items():
                if not db.update_rate_tier(tier_id, rate):
                    success = False
            
            if success:
                st.success("Rate tiers updated successfully!")
                st.rerun()
            else:
                st.error("Failed to update some rate tiers")
else:
    st.warning("No rate tiers configured.")

st.markdown("---")

# Calculation Examples
st.subheader("Calculation Examples")
st.markdown("How fees are calculated for each tier:")

tiers_for_calc = tiers if tiers else calculations.DEFAULT_RATE_TIERS

# Example calculation
example_size = st.slider("Example System Size (kWp)", 50, 5000, 500, 50)

example_costs = {
    'PM Cost': 500,
    'CCTV Cost': 200,
    'Cleaning Cost': 300,
}

st.markdown("**Example Site Fixed Costs:**")
col1, col2, col3 = st.columns(3)
with col1:
    st.write(f"PM Cost: £{example_costs['PM Cost']:,.2f}")
with col2:
    st.write(f"CCTV Cost: £{example_costs['CCTV Cost']:,.2f}")
with col3:
    st.write(f"Cleaning Cost: £{example_costs['Cleaning Cost']:,.2f}")

total_fixed_costs = sum(example_costs.values())
st.write(f"**Total Site Fixed Costs:** £{total_fixed_costs:,.2f}")

st.markdown("---")

# Calculate for each tier
st.markdown("**Fee Calculations by Tier:**")

calc_results = []
for tier in tiers_for_calc:
    portfolio_cost = example_size * tier['rate_per_kwp']
    fixed_fee = total_fixed_costs + portfolio_cost
    fee_per_kwp = fixed_fee / example_size if example_size > 0 else 0
    monthly_fee = fixed_fee / 12
    
    calc_results.append({
        'Tier': tier['tier_name'],
        'Rate (£/kWp)': f"£{tier['rate_per_kwp']:.2f}",
        'Portfolio Cost': f"£{portfolio_cost:,.2f}",
        'Fixed Fee': f"£{fixed_fee:,.2f}",
        'Fee/kWp': f"£{fee_per_kwp:.2f}",
        'Monthly Fee': f"£{monthly_fee:,.2f}",
    })

df_calc = pd.DataFrame(calc_results)
st.table(df_calc)

st.markdown("---")

# Formula Reference
st.subheader("Formula Reference")

st.markdown("""
| Calculation | Formula |
|-------------|---------|
| **Site Fixed Costs** | PM Cost + CCTV Cost + Cleaning Cost |
| **Portfolio Cost** | System Size (kWp) × Rate per kWp |
| **Fixed Fee** | Site Fixed Costs + Portfolio Cost |
| **Fee per kWp** | Fixed Fee ÷ System Size (only if contracted) |
| **Monthly Fee** | Fixed Fee ÷ 12 |
| **Corrective Days** | Portfolio Capacity (MW) ÷ 12 |
""")

st.markdown("---")

# Future Features
st.subheader("Coming Soon")
st.markdown("""
- 👤 User management and authentication
- 📊 Custom report generation
- 📋 Audit log viewer
- 📤 Export settings and data
""")
