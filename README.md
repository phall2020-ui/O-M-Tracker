# Clearsol O&M Portfolio Tracker

A Streamlit + SQLite portal for managing solar installation portfolios. It
replicates the Excel-based Portfolio Tracker spreadsheet: site fees, rate
tiers, SPVs and corrective-maintenance days.

## Features

- **Dashboard**: Portfolio KPIs, tier progress (MW to the next rate band), capacity by SPV, contracted-capacity timeline and a data-quality panel with one-click repair of SPV links
- **Sites Management**: Filterable, sortable table (search, SPV, contract, type, "only issues"), click-to-select rows, create/edit/delete with validation, CSV/Excel export
- **SPV Management**: Capacity, contracted share and revenue per SPV; flags unassigned sites and unrecognised SPV codes
- **CM Days Tracker**: Month-by-month corrective-maintenance day accrual (1 day per MW per year) vs. days used, with editable usage and notes
- **Excel / JSON Import**: Validated preview of every row (errors and warnings) before an atomic, all-or-nothing import; backup download of existing data
- **Automatic Calculations**: Portfolio costs, fixed fees, fee per kWp and monthly fees, priced at the tier the portfolio is actually in
- **Rate Tier Management**: View and edit portfolio rate tiers with validation and a worked example
- **Audit Log**: Every create, update, delete, import and rate change is recorded with before/after values
- **Data Quality**: Every write is normalised and validated (names, numbers, dates, contract flags, SPV codes); duplicates, missing dates and zero sizes are surfaced rather than silently stored

---

## Quick start

```bash
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501).

Set `CLEARSOL_DB_PATH` to store the SQLite file somewhere other than
`streamlit_app/clearsol_portfolio.db`. Set `APP_PASSWORD` (or a Streamlit
secret of the same name) to require a password before anyone can use the app.

### Tests

```bash
cd streamlit_app
python -m unittest discover -s tests -v
```

### Migrate legacy JSON (optional)

```bash
cd streamlit_app
python migrate_data.py
```

---

## Deploy

### Docker (recommended — SQLite persists on a volume)

```bash
docker compose up --build
```

The app is then at [http://localhost:8501](http://localhost:8501). Site data
lives in the `portfolio-data` volume (`CLEARSOL_DB_PATH=/data/clearsol_portfolio.db`).

To require a password:

```bash
APP_PASSWORD='choose-a-strong-password' docker compose up --build
```

### Streamlit Community Cloud

1. Open [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
2. **New app** → this repository → branch `main`.
3. Main file path: `streamlit_app/app.py`.
4. Advanced settings → Secrets (optional):

   ```toml
   APP_PASSWORD = "choose-a-strong-password"
   ```

Community Cloud's filesystem is ephemeral: import a backup after each
cold start, or point `CLEARSOL_DB_PATH` at a mounted volume. For a durable
deployment use Docker Compose above.

---

## App structure

```
streamlit_app/
├── app.py                    # Dashboard (entrypoint)
├── db.py                     # SQLite (validated writes, audit log, atomic import)
├── calculations.py           # Fee calculation logic
├── cm_days.py                # CM days accrual / usage ledger
├── validation.py             # Input normalisation and validation
├── importer.py               # Excel / JSON parsing with per-row diagnostics
├── data_quality.py           # Portfolio data-quality checks
├── ui.py                     # Shared chrome, navigation, formatting, export
├── migrate_data.py           # JSON → SQLite migration
├── requirements.txt
├── pages/
│   ├── 1_Sites.py
│   ├── 2_Site_Details.py
│   ├── 3_SPVs.py
│   ├── 4_Rate_Tiers.py
│   ├── 5_Import_Data.py
│   ├── 6_CM_Days.py
│   └── 7_Audit_Log.py
└── tests/
```

---

## Data rules

All writes (forms, imports, migration) pass through `validation.normalise_site`:

| Field | Rule |
|-------|------|
| Site name | Required; whitespace trimmed and collapsed. Duplicate names are warned about, not blocked |
| System size | Number ≥ 0 (forms require > 0); accepts `"1,250"`; 0 kWp is flagged on the dashboard |
| Contract status | `Yes/No/Y/N/True/False/1/0`; unknown values default to `No` with a warning |
| Onboard date | Stored as ISO `YYYY-MM-DD`; accepts Excel dates, `DD/MM/YYYY`, `DD-MM-YYYY`, `Mon YYYY`. Contracted sites without a date are flagged (they cannot accrue CM days) |
| Costs | Numbers ≥ 0; accepts `"£500"`; blank → 0 |
| SPV code | Upper-cased and trimmed; `spv_id` is always derived from the code. Unknown codes are kept but flagged |

Imports are atomic: every row is validated first, and either all valid rows are written (replacing the existing sites in one transaction) or nothing changes.

---

## Fee calculation logic

- **Site Fixed Costs** = PM Cost + CCTV Cost + Cleaning Cost
- **Portfolio Cost** = System Size (kWp) × Rate per kWp (tier-based)
- **Fixed Fee** = Site Fixed Costs + Portfolio Cost
- **Fee per kWp** = Fixed Fee / System Size (only if contracted)
- **Monthly Fee** = Fixed Fee / 12 (only if contracted)
- **Corrective Days** = Contracted Capacity (MW) / 12 per month, rounded to 0.1

All three tier columns are always calculated and shown per site (as in the spreadsheet). The **applicable** fixed fee, fee per kWp and monthly fee — and therefore the dashboard's revenue figures — use the tier the portfolio's total contracted capacity currently falls in, so revenue and the displayed tier can never disagree.

### CM Days

The framework grants 1 corrective-maintenance day per MW of contracted capacity per year. The tracker rebuilds each month's contracted capacity from site onboard dates (a site counts from the month it was onboarded), accrues capacity ÷ 12 days for that month, and subtracts the days recorded as used. Usage and notes are entered on the **CM Days** page.

### Rate Tiers

| Tier | Capacity Range | Rate (£/kWp) |
|------|---------------|--------------|
| <20MW | 0 - 20 MW | £2.00 |
| 20-30MW | 20 - 30 MW | £1.80 |
| 30-40MW | 30 - 40 MW | £1.70 |

---

## Legacy applications

The original Next.js app and the standalone HTML file are archived under
[`legacy/`](legacy/README.md). They are not maintained.

---

## License

Proprietary - Clearsol O&M
