# 0002: Notion as One-Way Summary Surface

## Status
Accepted

## Context
Current portfolio information lives in Notion, and existing Notion pages are still useful as a high-level communication surface. Letting Notion remain editable operational truth would require conflict resolution and duplicate validation rules.

## Decision
Use Notion for a one-time bootstrap import from Notion databases and then for one-way summary publishing only.

## Consequences
- Azure SQL becomes authoritative after import.
- Notion receives portfolio totals, CM usage, and SPV aggregates.
- Site-level operational data is managed in the platform, not mirrored fully to Notion.
- Sync failures are logged and do not block site or CM workflows.
