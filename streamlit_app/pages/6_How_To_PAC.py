"""
Plain-language picture guide: add a site to the pipeline and confirm PAC.
"""

from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="How to add a site and confirm PAC",
    page_icon="📘",
    layout="wide",
)

guide = (
    Path(__file__).resolve().parents[2]
    / "guides"
    / "add-sites-confirm-pac.html"
)

if not guide.exists():
    st.error("The picture guide could not be found. Please open guides/add-sites-confirm-pac.html")
    st.stop()

components.html(guide.read_text(encoding="utf-8"), height=2400, scrolling=True)
