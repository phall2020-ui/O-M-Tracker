# 0001: Azure SQL as Canonical Store

## Status
Accepted

## Context
The prototype used JSON files and had partial Prisma support. The production platform needs durable relational storage for sites, SPVs, users, CM work, audit logs, Notion imports, and summary sync runs.

## Decision
Use Azure SQL as the canonical production data store through Prisma with the `sqlserver` provider.

## Consequences
- The app has one operational source of truth.
- Site, CM, user, audit, and sync data can be queried transactionally.
- Prisma schema uses SQL Server-compatible strings for controlled values and serialized text for audit/sync payloads because SQL Server does not support Prisma enums or JSON columns.
