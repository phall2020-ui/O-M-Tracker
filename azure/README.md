# Azure Setup

This folder contains the production Azure setup for the O&M Tracker.

## What It Creates
- Azure App Service for the Next.js app.
- Linux App Service Plan running Node 22 LTS.
- Azure SQL logical server and Basic database.
- App settings for auth, Prisma, Notion, and cron sync.
- Optional daily Logic App workflow that calls `/api/cron/notion-sync`.

## Deploy
1. Install Azure CLI and run `az login`.
2. Copy `azure/main.parameters.example.json` to `azure/main.parameters.json`.
3. Fill the secure values.
4. Run:

```bash
RESOURCE_GROUP=clearsol-om-tracker-rg LOCATION=uksouth ./azure/deploy.sh
```

5. Deploy the app package through your preferred App Service deployment flow.
6. Run:

```bash
npx prisma migrate deploy
npm run db:seed
```

## Deploy To Existing Container Apps Environment
This subscription currently has no App Service VM quota, so the practical path is Azure Container Apps in `rg-application1`.

```bash
./azure/deploy-containerapp.sh
```

Defaults:
- Resource group: `rg-application1`
- Container Apps environment: `cae-anc-prod`
- ACR: `acrancampyrprod`
- App: `ca-om-tracker-prod`
- SQL Server: `clearsol-om-tracker-prod-sql`

Set `NOTION_TOKEN` before running if you want Notion import/sync live immediately.

## Notes
- `DATABASE_URL` is built from the provisioned Azure SQL server and database.
- The daily Logic App uses the `CRON_SECRET` value in the `x-cron-secret` header.
- `enableLogicApp` defaults to `false` because it requires the `Microsoft.Logic` provider to be registered by a subscription owner.
- Use `/admin` in the app to check configured environment state, run a Notion import preview, commit the import, and trigger summary sync.
