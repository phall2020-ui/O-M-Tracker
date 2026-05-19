# 0003: App-Managed Password Authentication

## Status
Accepted

## Context
Microsoft SSO would fit the Azure estate, but the product decision for v1 is to keep app-managed email/password accounts.

## Decision
Use NextAuth credentials with app-managed users and roles.

## Consequences
- The app owns password hashing, role assignment, and user lifecycle.
- Roles are enforced in API routes: Admin, Manager, Viewer, and Contractor.
- Future Microsoft Entra ID migration remains possible but will require an auth ADR update.
