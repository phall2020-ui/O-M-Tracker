#!/usr/bin/env sh
set -eu

if [ "${DB_BOOTSTRAP_ON_START:-false}" = "true" ]; then
  npx prisma db push
  npm run db:seed
fi

npm run start -- -p "${PORT:-3000}"
