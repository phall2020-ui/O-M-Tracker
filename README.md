# Clearsol O&M Portfolio Tracker

A web-based portal application for managing solar installation portfolios, replicating the functionality of the Excel-based Portfolio Tracker spreadsheet.

## Features

- **Dashboard**: Overview of portfolio statistics including total sites, capacity, monthly revenue, and current tier
- **Sites Management**: View, create, edit, and delete sites with automatic fee calculations
- **SPV Management**: View sites grouped by Special Purpose Vehicle
- **Excel Import**: Bulk import sites from your existing spreadsheet
- **Automatic Calculations**: All fee calculations (portfolio costs, fixed fees, fee per kWp) computed automatically
- **Rate Tier Management**: View and configure portfolio rate tiers

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
├── db.py                     # SQLite database layer
├── calculations.py           # Fee calculation logic
├── migrate_data.py           # JSON to SQLite migration script
├── requirements.txt          # Python dependencies
├── pages/                    # Streamlit multipage app
│   ├── 1_Sites.py           # Sites listing page
│   ├── 2_Site_Details.py    # Site view/edit/create page
│   ├── 3_SPVs.py            # SPV management page
│   ├── 4_Rate_Tiers.py      # Rate tier settings page
│   └── 5_Import_Data.py     # Excel/JSON import page
├── tests/                    # Unit tests
│   └── test_calculations.py # Calculation parity tests
└── clearsol_portfolio.db     # SQLite database (auto-created)
```

### Data Migration

To migrate existing JSON data to the new SQLite database:

```bash
cd streamlit_app
python migrate_data.py
```

### Running Tests

```bash
cd streamlit_app
python -m unittest tests.test_calculations -v
```

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
- **Monthly Fee** = Fixed Fee / 12
- **Corrective Days** = Portfolio Capacity (MW) / 12

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
| `/settings` Settings | `Rate Tiers` (pages/4_Rate_Tiers.py) |
| `/import` Import | `Import Data` (pages/5_Import_Data.py) |
| (new) | `SPVs` (pages/3_SPVs.py) |

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
