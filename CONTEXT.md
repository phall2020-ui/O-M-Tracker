# O&M Tracker Context

## Glossary

### Site
A solar installation managed in the O&M portfolio. A Site has a name, capacity, type, contract status, onboard date, SPV assignment, and fixed cost components.

### SPV
A special purpose vehicle that owns or groups Sites for portfolio reporting and invoice-style summaries.

### Contracted Site
A Site whose contract status is `Yes`. Contracted Sites contribute to contracted capacity, revenue calculations, portfolio tier selection, and CM day allowance.

### Portfolio Summary
The high-level operational and commercial rollup of the current portfolio, including site counts, contracted capacity, current tier, revenue, CM allowance, and SPV aggregates.

### CM Work Entry
A record of corrective maintenance work performed at a Site. CM Work Entries are logged with work date, hours, calculated days, description, technician, author, and review status.

### Approved CM Usage
The official CM day usage total. Only approved CM Work Entries count toward Approved CM Usage.

### Notion Summary Sync
A one-way publication of Portfolio Summary and SPV aggregate data from the production platform to existing Notion pages. Notion Summary Sync does not make Notion an operational source of truth.
