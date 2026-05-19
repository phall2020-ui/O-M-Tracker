# Roles and Permissions

## Role Matrix

| Role | Can see | Can do | Cannot do |
| --- | --- | --- | --- |
| Admin | All portfolio, operations, import, admin, and settings pages | Manage sites, imports, billing controls, month locks, adjustments, Notion sync, CM approval, CM submission, and exports | No app restrictions |
| Manager / Ade Asset Manager | Dashboard, Sites, Pipeline, SPV Portfolio, CM Review, Contractor Portal, Import Data | Manage sites, import operational data, manage billing month controls, approve/reject CM work, submit CM work, and export | Admin status/configuration and Settings |
| O&M Contractor | Dashboard, Sites, Pipeline, SPV Portfolio, CM Review, Contractor Portal | Submit CM work and export visible portfolio/CM/SPV data | Imports, billing controls, Admin, Settings, site editing, CM approval |
| Viewer | Dashboard, Sites, Pipeline, SPV Portfolio, CM Review | Read and export visible portfolio/CM/SPV data | Contractor Portal, CM submission, CM approval, imports, billing controls, site editing, Admin, Settings |

## Export Policy

- Sites standard Excel export is available to all authenticated roles.
- Sites bespoke Excel export is available to all authenticated roles.
- SPV monthly CSV export is available to all authenticated roles when report data exists.
- CM work CSV export is available to all authenticated roles when CM entries exist.
- Unauthenticated export requests redirect to login.

## Production Checks

Run:

```bash
APP_URL=https://ca-om-tracker-prod.blueground-aa6c330f.uksouth.azurecontainerapps.io npm run smoke:prod
```

The smoke test checks:

- login page and unauthenticated redirect behavior
- deep health check
- seeded role authentication
- standard and bespoke Excel export download for each role
