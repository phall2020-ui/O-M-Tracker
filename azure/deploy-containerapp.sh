#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-application1}"
LOCATION="${LOCATION:-uksouth}"
ACR_NAME="${ACR_NAME:-acrancampyrprod}"
CONTAINER_APP_ENV="${CONTAINER_APP_ENV:-cae-anc-prod}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-ca-om-tracker-prod}"
SQL_SERVER_NAME="${SQL_SERVER_NAME:-clearsol-om-tracker-prod-sql}"
SQL_DATABASE_NAME="${SQL_DATABASE_NAME:-om-tracker}"
SQL_ADMIN_LOGIN="${SQL_ADMIN_LOGIN:-omadmin}"
NOTION_SITES_DATABASE_ID="${NOTION_SITES_DATABASE_ID:-7dc7ccc45c5a43d7a75b2e97818089dc}"
NOTION_BILLING_DATABASE_ID="${NOTION_BILLING_DATABASE_ID:-39212e37c38b4c79b1cd8e54c976f7ea}"
NOTION_SUMMARY_PAGE_ID="${NOTION_SUMMARY_PAGE_ID:-f2b68e46501a49c89c035c7198b64004}"

existing_env_value() {
  local name="$1"
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_NAME" \
    --query "properties.template.containers[0].env[?name=='${name}'].value | [0]" \
    --output tsv 2>/dev/null || true
}

EXISTING_DATABASE_URL="$(existing_env_value DATABASE_URL)"
EXISTING_NEXTAUTH_SECRET="$(existing_env_value NEXTAUTH_SECRET)"
EXISTING_CRON_SECRET="$(existing_env_value CRON_SECRET)"
EXISTING_NOTION_TOKEN="$(existing_env_value NOTION_TOKEN)"

if [[ -z "${SQL_ADMIN_PASSWORD+x}" && -n "$EXISTING_DATABASE_URL" ]]; then
  SQL_ADMIN_PASSWORD="$(printf '%s' "$EXISTING_DATABASE_URL" | sed -n 's/.*password=\([^;]*\).*/\1/p')"
fi

SQL_ADMIN_PASSWORD="${SQL_ADMIN_PASSWORD:-OmT9!$(openssl rand -hex 12)Aa1}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-${EXISTING_NEXTAUTH_SECRET:-$(openssl rand -base64 48)}}"
CRON_SECRET="${CRON_SECRET:-${EXISTING_CRON_SECRET:-$(openssl rand -base64 32)}}"
NOTION_TOKEN="${NOTION_TOKEN:-${EXISTING_NOTION_TOKEN:-}}"

IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
IMAGE_NAME="${ACR_NAME}.azurecr.io/om-tracker:${IMAGE_TAG}"

if az sql server show --resource-group "$RESOURCE_GROUP" --name "$SQL_SERVER_NAME" >/dev/null 2>&1; then
  echo "SQL server $SQL_SERVER_NAME already exists; resetting administrator password for this deployment."
  az sql server update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$SQL_SERVER_NAME" \
    --admin-password "$SQL_ADMIN_PASSWORD" \
    --output table
else
  az sql server create \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --name "$SQL_SERVER_NAME" \
    --admin-user "$SQL_ADMIN_LOGIN" \
    --admin-password "$SQL_ADMIN_PASSWORD" \
    --enable-public-network true \
    --output table
fi

az sql server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --server "$SQL_SERVER_NAME" \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output table

if az sql db show --resource-group "$RESOURCE_GROUP" --server "$SQL_SERVER_NAME" --name "$SQL_DATABASE_NAME" >/dev/null 2>&1; then
  echo "SQL database $SQL_DATABASE_NAME already exists."
else
  az sql db create \
    --resource-group "$RESOURCE_GROUP" \
    --server "$SQL_SERVER_NAME" \
    --name "$SQL_DATABASE_NAME" \
    --edition Basic \
    --capacity 5 \
    --output table
fi

az acr build \
  --registry "$ACR_NAME" \
  --image "om-tracker:${IMAGE_TAG}" \
  .

DATABASE_URL="sqlserver://${SQL_SERVER_NAME}.database.windows.net:1433;database=${SQL_DATABASE_NAME};user=${SQL_ADMIN_LOGIN};password=${SQL_ADMIN_PASSWORD};encrypt=true;trustServerCertificate=true"
if [[ -n "$EXISTING_DATABASE_URL" ]]; then
  DATABASE_URL="$EXISTING_DATABASE_URL"
fi

APP_FQDN="$(az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" --query "properties.configuration.ingress.fqdn" --output tsv 2>/dev/null || true)"
APP_URL="${APP_FQDN:+https://${APP_FQDN}}"
APP_URL="${APP_URL:-https://${CONTAINER_APP_NAME}.${LOCATION}.azurecontainerapps.io}"

if az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" >/dev/null 2>&1; then
  az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_NAME" \
    --image "$IMAGE_NAME" \
    --set-env-vars \
      DATABASE_URL="$DATABASE_URL" \
      NEXTAUTH_URL="$APP_URL" \
      NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
      AUTH_URL="$APP_URL" \
      AUTH_SECRET="$NEXTAUTH_SECRET" \
      AUTH_TRUST_HOST=true \
      NOTION_TOKEN="$NOTION_TOKEN" \
      NOTION_SITES_DATABASE_ID="$NOTION_SITES_DATABASE_ID" \
      NOTION_BILLING_DATABASE_ID="$NOTION_BILLING_DATABASE_ID" \
      NOTION_SUMMARY_PAGE_ID="$NOTION_SUMMARY_PAGE_ID" \
      CRON_SECRET="$CRON_SECRET" \
      NODE_ENV=production \
    --output table
else
  az containerapp create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_NAME" \
    --environment "$CONTAINER_APP_ENV" \
    --image "$IMAGE_NAME" \
    --registry-server "${ACR_NAME}.azurecr.io" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 2 \
    --env-vars \
      DATABASE_URL="$DATABASE_URL" \
      NEXTAUTH_URL="$APP_URL" \
      NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
      AUTH_URL="$APP_URL" \
      AUTH_SECRET="$NEXTAUTH_SECRET" \
      AUTH_TRUST_HOST=true \
      NOTION_TOKEN="$NOTION_TOKEN" \
      NOTION_SITES_DATABASE_ID="$NOTION_SITES_DATABASE_ID" \
      NOTION_BILLING_DATABASE_ID="$NOTION_BILLING_DATABASE_ID" \
      NOTION_SUMMARY_PAGE_ID="$NOTION_SUMMARY_PAGE_ID" \
      CRON_SECRET="$CRON_SECRET" \
      NODE_ENV=production \
    --output table
fi

APP_FQDN="$(az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" --query "properties.configuration.ingress.fqdn" --output tsv)"
az containerapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_APP_NAME" \
  --set-env-vars \
    NEXTAUTH_URL="https://${APP_FQDN}" \
    AUTH_URL="https://${APP_FQDN}" \
    AUTH_SECRET="$NEXTAUTH_SECRET" \
    AUTH_TRUST_HOST=true \
  --output none

az containerapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_APP_NAME" \
  --query "{fqdn:properties.configuration.ingress.fqdn,latestRevision:properties.latestRevisionName}" \
  --output table
