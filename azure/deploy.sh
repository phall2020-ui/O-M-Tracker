#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-clearsol-om-tracker-rg}"
LOCATION="${LOCATION:-uksouth}"
PARAMETERS_FILE="${PARAMETERS_FILE:-azure/main.parameters.json}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required. Install it, then run az login." >&2
  exit 1
fi

if [[ ! -f "$PARAMETERS_FILE" ]]; then
  echo "Missing $PARAMETERS_FILE. Copy azure/main.parameters.example.json and fill the secure values." >&2
  exit 1
fi

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file azure/main.bicep \
  --parameters @"$PARAMETERS_FILE"

echo "Azure infrastructure deployed. Run database migrations before sending production traffic:"
echo "  npx prisma migrate deploy"
