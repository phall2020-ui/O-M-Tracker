# O&M Portfolio Tracker - Implementation Plan

## Current State Assessment

### ✅ Phase 1 Complete

The following features are fully implemented:

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard | ✅ | Stats cards, SPV breakdown, quick actions |
| Sites List | ✅ | TanStack Table with sorting, filtering, search |
| Site CRUD | ✅ | Create, read, update, delete via form |
| Site Detail Page | ✅ | View individual site with calculations |
| Excel Import | ✅ | Parse "Portfolio Tracker" tab, bulk import |
| Fee Calculations | ✅ | All tier-based calculations working |
| API Routes | ✅ | Full REST API for sites, SPVs, portfolio |
| Settings Page | ✅ | Rate tier display (read-only) |
| JSON Data Store | ✅ | File-based with in-memory cache |

### Tech Stack Installed
- Next.js 16 + React 19
- TanStack Table & Query
- Tailwind CSS v4
- Zod, Zustand, date-fns
- xlsx (Excel parsing)
- **Prisma** (installed, not configured)
- **NextAuth** (installed, not configured)

---

## Phase 2: Dashboard Enhancements & SPV Features

**Timeline: 2-3 weeks**

### 2.1 Dashboard Enhancements

#### 2.1.1 Revenue Trends Chart
- [ ] Add chart library (recharts or chart.js)
- [ ] Monthly revenue breakdown over last 12 months
- [ ] Capacity growth visualization
- [ ] Filter by SPV

#### 2.1.2 Enhanced Stats
- [ ] Average fee per kWp across portfolio
- [ ] Sites by contract status donut chart
- [ ] Capacity utilization by site type (Rooftop vs Ground Mount)
- [ ] Year-over-year comparison cards

#### 2.1.3 Interactive Filters
- [ ] Date range picker for dashboard
- [ ] SPV filter dropdown
- [ ] Contract status filter
- [ ] Export dashboard data as PDF

### 2.2 SPV Invoice Breakdown

#### 2.2.1 SPV List Page
- [ ] Create `/spvs` page with all SPVs
- [ ] Site count, total capacity, monthly revenue per SPV
- [ ] Add SPV management (CRUD)

#### 2.2.2 SPV Detail Page
- [ ] Create `/spvs/[code]` page
- [ ] List all sites under SPV
- [ ] Invoice summary table
- [ ] Monthly breakdown per site

#### 2.2.3 Invoice Generation
- [ ] Generate invoice breakdown by SPV
- [ ] Export invoice as PDF/Excel
- [ ] Date range selection for invoice period
- [ ] Add invoice history tracking

### 2.3 Sites Page Improvements

#### 2.3.1 Advanced Filtering
- [ ] Multi-select SPV filter
- [ ] Contract status filter toggle
- [ ] Date range filter (onboard date)
- [ ] Save filter presets

#### 2.3.2 Bulk Operations
- [ ] Select multiple sites
- [ ] Bulk update contract status
- [ ] Bulk assign SPV
- [ ] Bulk export to Excel

#### 2.3.3 Column Customization
- [ ] Show/hide columns
- [ ] Persist column preferences
- [ ] Column reordering

---

## Phase 3: Authentication & Administration

**Timeline: 2-3 weeks**

### 3.1 Authentication Setup

#### 3.1.1 NextAuth Configuration
- [ ] Configure NextAuth with Credentials provider
- [ ] Set up JWT sessions
- [ ] Create login page (`/login`)
- [ ] Protected route middleware

#### 3.1.2 User Management
- [ ] User table in database
- [ ] User registration flow (admin only)
- [ ] Password reset functionality
- [ ] Profile page

#### 3.1.3 Role-Based Access Control
- [ ] Define roles: Admin, Manager, Viewer
- [ ] Permission matrix
  - Admin: Full access
  - Manager: Edit sites, view reports
  - Viewer: Read-only
- [ ] Role-based UI rendering

### 3.2 Rate Tier Management

#### 3.2.1 Editable Rate Tiers
- [ ] Move rate tiers to database
- [ ] CRUD interface in Settings
- [ ] Validation (no overlapping ranges)
- [ ] Preview impact of rate changes

#### 3.2.2 Rate History
- [ ] Track rate tier changes over time
- [ ] Effective date for rate changes
- [ ] Historical calculations

### 3.3 Audit Logging

#### 3.3.1 Activity Logging
- [ ] Log all CRUD operations
- [ ] Track: user, action, timestamp, old/new values
- [ ] Store in database

#### 3.3.2 Audit Log Viewer
- [ ] Create `/settings/audit-log` page
- [ ] Filter by user, action type, date
- [ ] Search by site name
- [ ] Export audit log

#### 3.3.3 Change History per Site
- [ ] Show change history on site detail page
- [ ] "Last modified by" indicator
- [ ] Revert capability (admin only)

---

## Phase 4: Database Migration & Deployment

**Timeline: 2-3 weeks**

### 4.1 PostgreSQL Setup

#### 4.1.1 Prisma Schema Design
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String
  role      Role     @default(VIEWER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  auditLogs AuditLog[]
}

model Site {
  id             String    @id @default(cuid())
  name           String
  systemSizeKwp  Float
  siteType       SiteType  @default(ROOFTOP)
  contractStatus ContractStatus @default(NO)
  onboardDate    DateTime?
  pmCost         Float     @default(0)
  cctvCost       Float     @default(0)
  cleaningCost   Float     @default(0)
  spv            SPV?      @relation(fields: [spvId], references: [id])
  spvId          String?
  sourceSheet    String?
  sourceRow      Int?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  
  auditLogs      AuditLog[]
}

model SPV {
  id        String   @id @default(cuid())
  code      String   @unique
  name      String
  sites     Site[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model RateTier {
  id            String   @id @default(cuid())
  tierName      String
  minCapacityMW Float
  maxCapacityMW Float?
  ratePerKwp    Float
  effectiveFrom DateTime @default(now())
  effectiveTo   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AuditLog {
  id         String   @id @default(cuid())
  action     AuditAction
  entityType String
  entityId   String
  oldValues  Json?
  newValues  Json?
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  site       Site?    @relation(fields: [siteId], references: [id])
  siteId     String?
  createdAt  DateTime @default(now())
}

enum Role {
  ADMIN
  MANAGER
  VIEWER
}

enum SiteType {
  ROOFTOP
  GROUND_MOUNT
}

enum ContractStatus {
  YES
  NO
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  IMPORT
}
```

#### 4.1.2 Database Setup
- [ ] Configure DATABASE_URL in environment
- [ ] Run Prisma migrations
- [ ] Create seed script for initial data

#### 4.1.3 Data Migration
- [ ] Create migration script from JSON
- [ ] Validate data integrity
- [ ] Backup existing JSON files

### 4.2 API Refactoring

#### 4.2.1 Convert to Prisma
- [ ] Update `/api/sites` routes
- [ ] Update `/api/spvs` routes
- [ ] Update `/api/portfolio` route
- [ ] Update `/api/import` route

#### 4.2.2 Add New Endpoints
- [ ] `/api/users` - User management
- [ ] `/api/rate-tiers` - Rate tier CRUD
- [ ] `/api/audit-logs` - Audit log queries
- [ ] `/api/invoices` - Invoice generation

### 4.3 Deployment

#### 4.3.1 Production Setup
- [ ] Configure Vercel/Railway/DigitalOcean
- [ ] Set up PostgreSQL (Neon/Supabase/Railway)
- [ ] Configure environment variables
- [ ] Set up domain/SSL

#### 4.3.2 CI/CD Pipeline
- [ ] GitHub Actions for testing
- [ ] Auto-deploy on main branch
- [ ] Database migration automation
- [ ] Staging environment

#### 4.3.3 Monitoring & Backups
- [ ] Set up error tracking (Sentry)
- [ ] Database backup schedule
- [ ] Performance monitoring
- [ ] Uptime monitoring

---

## Future Enhancements (Post-Phase 4)

### 5.1 Advanced Features
- [ ] Email notifications (contract renewals, capacity milestones)
- [ ] API integrations with monitoring systems
- [ ] Mobile-responsive PWA
- [ ] Multi-tenant support

### 5.2 Reporting
- [ ] Custom report builder
- [ ] Scheduled report delivery
- [ ] Financial year summaries
- [ ] KPI dashboards

### 5.3 Document Management
- [ ] Contract document uploads per site
- [ ] Certificate storage (O&M, insurance)
- [ ] Document expiry tracking

---

## Priority Order & Quick Wins

### High Priority (Start First)
1. **PostgreSQL + Prisma Setup** - Foundation for everything else
2. **Authentication** - Security requirement
3. **SPV Invoice Page** - High business value

### Medium Priority
4. Dashboard charts
5. Rate tier management
6. Audit logging

### Lower Priority (Polish)
7. Bulk operations
8. Column customization
9. Export to PDF

---

## Implementation Checklist

### Immediate Next Steps

```bash
# 1. Initialize Prisma
npx prisma init

# 2. Configure database URL in .env
DATABASE_URL="postgresql://..."

# 3. Create schema and migrate
npx prisma migrate dev --name init

# 4. Generate client
npx prisma generate
```

### File Structure to Add

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   ├── users/
│   │   │   └── route.ts
│   │   ├── rate-tiers/
│   │   │   └── route.ts
│   │   └── invoices/
│   │       └── route.ts
│   ├── spvs/
│   │   ├── [code]/
│   │   │   └── page.tsx
│   │   └── page.tsx
│   └── settings/
│       ├── users/
│       │   └── page.tsx
│       ├── rate-tiers/
│       │   └── page.tsx
│       └── audit-log/
│           └── page.tsx
├── components/
│   ├── auth/
│   │   └── LoginForm.tsx
│   ├── charts/
│   │   ├── RevenueChart.tsx
│   │   └── CapacityChart.tsx
│   ├── invoices/
│   │   └── InvoiceTable.tsx
│   └── spvs/
│       └── SpvCard.tsx
├── lib/
│   ├── auth.ts
│   ├── prisma.ts
│   └── audit.ts
└── prisma/
    ├── schema.prisma
    └── seed.ts
```

---

## Effort Estimates

| Phase | Features | Effort | Dependencies |
|-------|----------|--------|--------------|
| Phase 2.1 | Dashboard enhancements | 5 days | Chart library |
| Phase 2.2 | SPV invoice breakdown | 4 days | - |
| Phase 2.3 | Sites page improvements | 3 days | - |
| Phase 3.1 | Authentication | 4 days | Database |
| Phase 3.2 | Rate tier management | 2 days | Database |
| Phase 3.3 | Audit logging | 3 days | Database, Auth |
| Phase 4.1 | PostgreSQL setup | 3 days | - |
| Phase 4.2 | API refactoring | 4 days | Database |
| Phase 4.3 | Deployment | 2 days | All |

**Total Estimated Effort: ~30 days (6-8 weeks with buffer)**

---

## Notes

- Prisma and NextAuth are already in `package.json` but not configured
- The calculations library is solid and reusable
- JSON data can be migrated directly to PostgreSQL
- Component architecture supports feature additions well

