# Clearsol O&M Portfolio Tracker

A web-based portal application for managing solar installation portfolios, replicating the functionality of the Excel-based Portfolio Tracker spreadsheet.

## Features

### Phase 1 ✅
- **Dashboard**: Overview of portfolio statistics including total sites, capacity, monthly revenue, and current tier
- **Sites Management**: View, create, edit, and delete sites with automatic fee calculations
- **Excel Import**: Bulk import sites from your existing spreadsheet
- **Automatic Calculations**: All fee calculations (portfolio costs, fixed fees, fee per kWp) computed automatically

### Phase 2 ✅
- **Enhanced Dashboard**: Revenue trend charts, capacity visualization, contract status breakdown
- **SPV Portfolio**: Dedicated SPV management with invoice breakdown per SPV
- **Invoice Export**: Export invoice data as CSV per SPV

### Phase 3 ✅
- **Authentication**: Secure login with NextAuth.js
- **Protected Routes**: All pages require authentication
- **Role-Based Access**: Admin, Manager, Viewer roles (database ready)

### Current Production Scope
- **Billing Snapshots**: Generate monthly app-owned billing snapshots and sync them to Notion
- **CM Workflows**: Contractor submissions, manager review, and month-on-month allowance tracking
- **Admin Operations**: Notion import/sync, billing month locks, manual billing adjustments, and readiness checks

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn
- SQL Server or Azure SQL

### Installation

1. Navigate to the project directory:
   ```bash
   cd O-M-Tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Then set at minimum:
   DATABASE_URL="sqlserver://localhost:1433;database=om_tracker;user=sa;password=<password>;encrypt=true;trustServerCertificate=true"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   AUTH_SECRET="your-secret-key-here"
   ```

4. Set up the SQL Server database:
   ```bash
   npm run db:push      # Push schema to database
   npm run db:seed      # Seed with default data
   ```

   For an existing populated database moving to the multi-contract schema, deploy in this order:
   1. Add `contractId` columns as nullable in the database migration.
   2. Run `npm run db:contract-backfill` with `DATABASE_URL` set.
   3. Make the `contractId` columns required and apply the final indexes/foreign keys.
   4. Run `npm run db:generate` and redeploy the app.

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

### Default Login Credentials

After seeding the database:
- **Email**: admin@clearsol.co.uk
- **Password**: admin123
- **View only email**: viewer@clearsol.co.uk
- **View only password**: viewer123

### Importing Your Data

1. Go to **Import Data** in the sidebar
2. Upload your `Clearsol_O_M_Framework_Tracker.xlsx` file
3. The importer will read the "Portfolio Tracker" tab and reconcile matching site rows
4. View imported sites in the **Sites** page

## Project Structure

```
O-M-Tracker/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Database seed script
├── src/
│   ├── app/
│   │   ├── api/            # API routes
│   │   │   ├── auth/       # NextAuth endpoints
│   │   │   ├── dashboard/  # Dashboard data
│   │   │   ├── sites/      # Sites CRUD
│   │   │   ├── spvs/       # SPV endpoints
│   │   │   ├── portfolio/  # Portfolio summary
│   │   │   └── import/     # Excel import
│   │   ├── login/          # Login page
│   │   ├── sites/          # Sites pages
│   │   ├── spvs/           # SPV pages
│   │   ├── import/         # Import page
│   │   └── settings/       # Settings page
│   ├── components/
│   │   ├── charts/         # Dashboard charts
│   │   ├── ui/             # Base UI components
│   │   ├── layout/         # Layout components
│   │   └── sites/          # Site-specific components
│   ├── lib/
│   │   ├── auth.ts         # NextAuth configuration
│   │   ├── prisma.ts       # Prisma client
│   │   ├── calculations.ts # Fee calculation logic
│   │   ├── db.ts           # JSON data store
│   │   └── utils.ts        # Helper functions
│   └── types/              # TypeScript types
├── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/sites | List all sites with calculations |
| POST | /api/sites | Create a new site |
| GET | /api/sites/:id | Get site details |
| PUT | /api/sites/:id | Update a site |
| DELETE | /api/sites/:id | Delete a site |
| GET | /api/spvs | List all SPVs |
| GET | /api/spvs/summary | SPV summary with revenue |
| GET | /api/spvs/:code | SPV details with sites |
| GET | /api/portfolio | Get portfolio summary |
| GET | /api/dashboard | Get dashboard data with charts |
| POST | /api/import | Import from Excel |

## Database Commands

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database (no migration)
npm run db:migrate    # Run migrations
npm run db:seed       # Seed database with default data
npm run db:studio     # Open Prisma Studio
```

## Fee Calculation Logic

The app replicates the spreadsheet formulas:

- **Site Fixed Costs** = PM Cost + CCTV Cost + Cleaning Cost
- **Portfolio Cost** = System Size (kWp) × Rate per kWp (tier-based)
- **Fixed Fee** = Site Fixed Costs + Portfolio Cost
- **Fee per kWp** = Fixed Fee / System Size (only if contracted)
- **Monthly Fee** = Fixed Fee / 12

Portfolio rate:
- **Standard: £1.70/kWp** — applied to every site regardless of portfolio capacity.

The capacity-banded tiers (<20MW £2.00, 20-30MW £1.80, 30-40MW £1.70) are superseded. They are
kept in `LEGACY_RATE_TIERS` and shown greyed out in Settings and on site detail pages so
historical billing snapshots that reference them by name stay readable. Billing months already
generated keep the rate they were generated at.

## Data migrations

These scripts are dry-run by default and print their plan; pass `--apply` to write, and
`--revert --apply` to undo.

```bash
npm run db:standard-rate      # retire capacity bands, put every contract on £1.70/kWp
npm run db:eden-contractor    # move Eden sites out of Clearsol into their own Eden contract
npm run db:om-acceptance      # backfill O&M acceptance for existing contracted sites
```

`db:eden-contractor` creates the `EDEN` contractor and `EDEN_O_M` contract, mirrors the SPVs the
Eden sites use, and reassigns those sites plus their billing snapshots, adjustments and CM work.
Set the Eden contract's Notion billing database ID in Settings before running a Notion sync for it.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: SQL Server/Azure SQL with Prisma
- **Auth**: NextAuth.js v5
- **Charts**: Recharts
- **Tables**: TanStack Table
- **Excel Parsing/Export**: ExcelJS
- **State**: Zustand

## Screenshots

### Dashboard
- Revenue trend charts
- Capacity by SPV visualization
- Contract status breakdown
- Top earning sites

### SPV Portfolio
- SPV cards with revenue summary
- Invoice breakdown per SPV
- CSV export functionality

### Sites Management
- Sortable, filterable table
- Inline calculations
- Quick search

## License

Proprietary - Clearsol O&M
