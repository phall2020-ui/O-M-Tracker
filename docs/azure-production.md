# Azure Production Deployment

## Target Architecture
- Next.js app and API routes run on Azure App Service.
- Azure SQL is the canonical database.
- Prisma manages schema and application data access with the `sqlserver` provider.
- Notion is used for initial database import and one-way high-level summary sync.
- A scheduled Azure job calls `/api/cron/notion-sync` daily with `x-cron-secret`.

## Required App Settings
Set these in the App Service configuration:

```text
DATABASE_URL=sqlserver://<server>.database.windows.net:1433;database=<db>;user=<user>;password=<password>;encrypt=true;trustServerCertificate=false
NEXTAUTH_URL=https://<app-name>.azurewebsites.net
NEXTAUTH_SECRET=<strong random value>
NOTION_TOKEN=<notion integration secret>
NOTION_SITES_DATABASE_ID=<source Notion sites database id>
NOTION_BILLING_DATABASE_ID=<target Notion billing database id>
NOTION_SUMMARY_PAGE_ID=<existing ClearSol O M Summary page id>
CRON_SECRET=<strong random value for scheduled sync>
```

## Deployment Steps
1. Provision Azure SQL and App Service.
2. Configure App Service settings above.
3. Run `npx prisma generate`.
4. For existing populated databases, run `npm run db:contract-backfill` once before enforcing the final required `contractId` relations.
5. Run `npx prisma migrate deploy` or the approved SQL deployment against Azure SQL.
6. Run `npm run build`.
7. Deploy the Next.js app to App Service.
8. Seed the first admin user with `npm run db:seed` or a controlled production user-creation script.
9. Use `POST /api/admin/import/notion?contract=<contract-id>` first with `{"commit": false}` to validate Notion rows.
10. Re-run `POST /api/admin/import/notion?contract=<contract-id>` with `{"commit": true}` only after the validation report has no errors.
11. Configure an Azure Logic App, Automation job, or scheduled Function to call `GET /api/cron/notion-sync` daily with the `x-cron-secret` header.

## Operational Notes
- Site CRUD and CM workflows should continue if Notion is unavailable.
- Contractor users can submit CM work but cannot approve it or edit site commercial data.
- Only approved CM entries count toward official usage and Notion summary sync.
- New contracts are managed from `/settings`; deactivation preserves historical rows and does not delete data.
- Contract-specific Notion summary page and billing database ids can be configured per contract. If left blank, the app falls back to the environment-level Notion ids.
- SharePoint documents in this repo describe a historical prototype deployment path, not the production target.
