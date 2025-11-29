# Clearsol O&M Portfolio Tracker

A web-based portal application for managing solar installation portfolios, replicating the functionality of the Excel-based Portfolio Tracker spreadsheet.

## Features (Phase 1)

- **Dashboard**: Overview of portfolio statistics including total sites, capacity, monthly revenue, and current tier
- **Sites Management**: View, create, edit, and delete sites with automatic fee calculations
- **Excel Import**: Bulk import sites from your existing spreadsheet
- **Automatic Calculations**: All fee calculations (portfolio costs, fixed fees, fee per kWp) computed automatically

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

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

### Importing Your Data

1. Go to **Import Data** in the sidebar
2. Upload your `Clearsol_O_M_Framework_Tracker.xlsx` file
3. The importer will read the "Portfolio Tracker" tab and import all sites
4. View imported sites in the **Sites** page

## Project Structure

```
portfolio-tracker/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── sites/         # Sites CRUD endpoints
│   │   │   ├── spvs/          # SPV list endpoint
│   │   │   ├── portfolio/     # Portfolio summary
│   │   │   └── import/        # Excel import
│   │   ├── sites/             # Sites pages
│   │   ├── import/            # Import page
│   │   └── settings/          # Settings page
│   ├── components/            # React components
│   │   ├── ui/               # Base UI components
│   │   ├── layout/           # Layout components
│   │   └── sites/            # Site-specific components
│   ├── lib/                   # Utilities
│   │   ├── calculations.ts   # Fee calculation logic
│   │   ├── db.ts            # Data store
│   │   └── utils.ts         # Helper functions
│   ├── types/                # TypeScript types
│   └── data/                 # JSON data files (local storage)
├── package.json
└── README.md
```

## Data Storage

For Phase 1, data is stored in JSON files in `src/data/`:
- `sites.json` - All site data
- `spvs.json` - SPV definitions

This will be migrated to a proper database (PostgreSQL) in later phases.

## API Endpoints

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

## Fee Calculation Logic

The app replicates the spreadsheet formulas:

- **Site Fixed Costs** = PM Cost + CCTV Cost + Cleaning Cost
- **Portfolio Cost** = System Size (kWp) × Rate per kWp (tier-based)
- **Fixed Fee** = Site Fixed Costs + Portfolio Cost
- **Fee per kWp** = Fixed Fee / System Size (only if contracted)
- **Monthly Fee** = Fixed Fee / 12

Rate tiers:
- <20MW: £2.00/kWp
- 20-30MW: £1.80/kWp  
- 30-40MW: £1.70/kWp

## Roadmap

- **Phase 1** (Current): Basic CRUD, import, calculations ✅
- **Phase 2**: Dashboard enhancements, SPV invoice breakdown
- **Phase 3**: Authentication, rate tier management, audit logs
- **Phase 4**: PostgreSQL migration, deployment

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: Custom UI components
- **Tables**: TanStack Table
- **Excel Parsing**: xlsx library

## License

Proprietary - Clearsol O&M
