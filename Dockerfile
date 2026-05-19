FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL='sqlserver://localhost:1433;database=build;user=sa;password=BuildPass123!;trustServerCertificate=true' npx prisma generate
RUN NEXTAUTH_SECRET=build-secret NEXTAUTH_URL=http://localhost:3000 DATABASE_URL='sqlserver://localhost:1433;database=build;user=sa;password=BuildPass123!;trustServerCertificate=true' npm run build

FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "scripts/container-start.sh"]
