# Clearsol O&M Portfolio Tracker

Next.js portal for managing solar installation portfolios — sites, SPVs, rate
tiers, Excel import and corrective-maintenance days.

## Why this is Next.js (not Streamlit)

The repo was migrated to Streamlit + SQLite in an earlier PR because that
stack is quick to stand up for an internal ops tool. This project is now
back on **Next.js** because:

- You asked for the app in Next.js, not Streamlit.
- The product already had a typed Next.js UI (tables, CM Days, site forms)
  that Operations can extend in code.
- Fees, validation and audit belong in shared TypeScript modules, not a
  second Python implementation that drifts.

Streamlit remains under [`legacy/streamlit/`](legacy/streamlit/) as an
archive. The standalone HTML file is under [`legacy/`](legacy/).

## Features

- Dashboard with tier progress, capacity by SPV and a data-quality panel
- Sites table: sort, filter (contract / SPV / issues), CSV export, validated create/edit
- SPV page with unassigned and unknown-code flags
- CM Days tracker (accrual vs usage since portfolio start)
- Excel import with per-row preview; import writes only after validation
- Audit log for create / update / delete / import
- Monthly fees priced at the portfolio's **actual** rate tier

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

```bash
docker compose up --build
```

The app listens on port 3000.

## Data rules

Writes go through `src/lib/validation.ts`: names trimmed, numbers accept
`£1,250`, dates accept Excel serials and DD/MM/YYYY, contract flags accept
Yes/No/Y/N, SPV codes are upper-cased and `spvId` is derived from the code.

## License

Proprietary — Clearsol O&M
