# Clearsol O&M Portfolio Tracker

A web-based portal application for managing solar installation portfolios, replicating the functionality of the Excel-based Portfolio Tracker spreadsheet.

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

## 🆕 Streamlit + SQLite Version (Recommended)

The application has been migrated to **Streamlit + SQLite** for improved simplicity, deployment, and maintainability.

### Quick Start (Streamlit)

1. Navigate to the Streamlit app directory:
   ```bash
   cd streamlit_app
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:
   ```bash
   streamlit run app.py
   ```

4. Open [http://localhost:8501](http://localhost:8501) in your browser

### Streamlit App Structure

```
streamlit_app/
├── app.py                    # Main entry point (Dashboard)
├── db.py                     # SQLite database layer (validated writes, audit log, atomic import)
├── calculations.py           # Fee calculation logic
├── cm_days.py                # CM days accrual / usage ledger
├── validation.py             # Input normalisation and validation rules
├── importer.py               # Excel / JSON parsing with per-row diagnostics
├── data_quality.py           # Portfolio data-quality checks
├── ui.py                     # Shared page chrome, navigation, formatting, export helpers
├── migrate_data.py           # JSON to SQLite migration script
├── requirements.txt          # Python dependencies
├── pages/                    # Streamlit multipage app
│   ├── 1_Sites.py           # Sites listing page
│   ├── 2_Site_Details.py    # Site view/edit/create page
│   ├── 3_SPVs.py            # SPV management page
│   ├── 4_Rate_Tiers.py      # Settings: rate tiers, worked example, formulas
│   ├── 5_Import_Data.py     # Excel/JSON import page
│   ├── 6_CM_Days.py         # CM days tracker
│   └── 7_Audit_Log.py       # Audit log viewer
├── tests/                    # Unit tests
│   ├── test_calculations.py # Calculation parity tests
│   ├── test_cm_days.py      # CM days ledger tests
│   ├── test_data_quality.py # Data-quality rule tests
│   ├── test_db.py           # Database layer tests (temp DB per test)
│   ├── test_importer.py     # Spreadsheet/JSON parsing tests
│   └── test_validation.py   # Normalisation/validation tests
└── clearsol_portfolio.db     # SQLite database (auto-created, git-ignored)
```

Set `CLEARSOL_DB_PATH` to store the SQLite file somewhere other than `streamlit_app/`.

### Data Migration

To migrate existing JSON data to the new SQLite database:

```bash
cd streamlit_app
python migrate_data.py
```

### Running Tests

```bash
cd streamlit_app
python -m unittest discover -s tests -v
```

### Data Rules

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

## Legacy Next.js Version

The original Next.js version is still available in the `src/` directory.

### Prerequisites (Next.js)

- Node.js 18+ installed
- npm or yarn

### Installation (Next.js)

1. Navigate to the project directory:
   ```bash
   cd portfolio-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Next.js Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── sites/         # Sites CRUD endpoints
│   │   ├── spvs/          # SPV list endpoint
│   │   ├── portfolio/     # Portfolio summary
│   │   └── import/        # Excel import
│   ├── sites/             # Sites pages
│   ├── import/            # Import page
│   └── settings/          # Settings page
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── layout/           # Layout components
│   └── sites/            # Site-specific components
├── lib/                   # Utilities
│   ├── calculations.ts   # Fee calculation logic
│   ├── db.ts            # JSON data store
│   └── utils.ts         # Helper functions
├── types/                # TypeScript types
└── data/                 # JSON data files
```

### API Endpoints (Next.js)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/sites | List all sites with calculations |
| POST | /api/sites | Create a new site |
| GET | /api/sites/:id | Get site details |
| PUT | /api/sites/:id | Update a site |
| DELETE | /api/sites/:id | Delete a site |
| GET | /api/spvs | List all SPVs |
| GET | /api/portfolio | Get portfolio summary |
| POST | /api/import | Import from Excel |

---

## Fee Calculation Logic

The app replicates the spreadsheet formulas:

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

## Page Mapping (Legacy → Streamlit)

| Legacy Page | Streamlit Page |
|------------|----------------|
| `/` Dashboard | `Dashboard` (app.py) |
| `/sites` Sites table | `Sites` (pages/1_Sites.py) |
| `/sites/[id]` Site detail | `Site Details` (pages/2_Site_Details.py) |
| `/settings` Settings | `Settings` (pages/4_Rate_Tiers.py) |
| `/import` Import | `Import Data` (pages/5_Import_Data.py) |
| `/cm-days` CM Days | `CM Days` (pages/6_CM_Days.py) |
| (new) | `SPVs` (pages/3_SPVs.py) |
| (new) | `Audit Log` (pages/7_Audit_Log.py) |

---

## Tech Stack Comparison

| Feature | Legacy (Next.js) | New (Streamlit) |
|---------|-----------------|-----------------|
| Framework | Next.js 14 | Streamlit |
| Language | TypeScript | Python |
| Database | JSON files | SQLite |
| Tables | TanStack Table | st.dataframe |
| Styling | Tailwind CSS | Streamlit native |
| Deployment | Node.js server | Python/Streamlit |

---

## License

Proprietary - Clearsol O&M
