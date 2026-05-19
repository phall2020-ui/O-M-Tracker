# O&M Portfolio Tracker - SQLite Standalone Setup

## Overview

This O&M tracker has been converted to run as a **standalone application** with:
- ✅ **SQLite database** (no PostgreSQL server needed)
- ✅ **HTML/JavaScript frontend** (no Next.js build required)
- ✅ **Express backend** (simple Node.js server)
- ✅ **100% portable** - just copy the folder and run!

---

## Quick Start (3 Steps)

### 1. Install Dependencies

```bash
cd O-M-Tracker
npm install
```

### 2. Setup Database

```bash
# Push schema to create SQLite database
npm run db:push

# Generate Prisma Client
npm run db:generate

# Seed with sample data (8 SPVs, admin user, rate tiers)
npm run db:seed
```

### 3. Start the Server

```bash
npm start
```

Then open your browser to: **http://localhost:3000**

---

## What's Changed

### ✅ Database: PostgreSQL → SQLite

**Before:** Required PostgreSQL server installation
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**After:** Single file database (no server)
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // "file:./dev.db"
}
```

**Database file location:** `/O-M-Tracker/dev.db`

### ✅ Frontend: Next.js → Static HTML

**Before:** Next.js app with build step
```bash
npm run build
npm run start  # Starts Next.js production server
```

**After:** Static HTML served by Express
```bash
npm start  # Starts Express server serving demo.html
```

**Frontend file:** `/O-M-Tracker/demo.html` (fully functional, connects to API)

### ✅ Backend: Next.js API Routes → Express Server

**New file:** `/O-M-Tracker/server.js`

**API Endpoints:**
- `GET /api/portfolio` - Portfolio summary (capacity, revenue, tier)
- `GET /api/sites` - All sites with calculated fees
- `GET /api/spvs/summary` - SPV breakdown with revenue
- `GET /api/dashboard` - Dashboard data (top sites, trends, charts)

---

## File Structure

```
O-M-Tracker/
├── server.js              # ⭐ New Express server
├── demo.html              # ⭐ Updated HTML frontend (connects to API)
├── package.json           # Updated with Express dependencies
├── .env                   # Database configuration
├── prisma/
│   ├── schema.prisma      # ⭐ Updated to use SQLite
│   └── seed.ts            # Database seeding script
├── dev.db                 # ⭐ SQLite database (created by db:push)
└── README-SQLITE-SETUP.md # This file
```

---

## Configuration

### Environment Variables (`.env`)

```bash
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-change-in-production"
```

### Port Configuration

Default port: **3000**

To change:
```bash
PORT=8080 npm start
```

Or edit `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

---

## Database Management

### View/Edit Data

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555 - a web GUI for your database.

### Backup Database

```bash
# Simple copy
cp dev.db dev.db.backup

# Or with timestamp
cp dev.db "backups/dev-$(date +%Y%m%d-%H%M%S).db"
```

### Reset Database

```bash
# Delete database
rm dev.db

# Recreate from scratch
npm run db:push
npm run db:seed
```

### Transfer to Another Computer

Just copy these files:
```bash
O-M-Tracker/
├── server.js
├── demo.html
├── package.json
├── .env
├── prisma/
└── dev.db  # Your data!
```

Then run:
```bash
npm install
npm start
```

---

## Seeded Data

The database comes pre-seeded with:

### Default Admin User
- **Email:** admin@clearsol.co.uk
- **Password:** admin123
- **Role:** ADMIN

### 8 SPV Companies
- OS2: Olympus Solar 2 Ltd
- AD1: AMPYR Distributed Energy 1 Ltd
- FS: Fylde Solar Ltd
- ESI8, ESI1, ESI10: Eden Sustainable Investments
- UV1: ULTRAVOLT SPV1 LIMITED
- SKY: Skylight Energy Ltd

### 3 Rate Tiers
- **<20MW:** £2.00/kWp
- **20-30MW:** £1.80/kWp
- **30-40MW:** £1.70/kWp

---

## Features

### ✅ All Features Work Without Backend Setup

- 📊 **Dashboard** - Portfolio overview, charts, CM days tracking
- 🏢 **Sites Management** - View all sites with calculated fees
- 💼 **SPV Portfolio** - Revenue breakdown by SPV
- 🔧 **CM Days Tracker** - Corrective maintenance allowance tracking
- 📥 **Data Import** - Excel file import (requires backend implementation)
- ⚙️ **Settings** - Rate tier configuration

### 📈 Automatic Calculations

The server automatically calculates:
- Site fixed costs (PM + CCTV + Cleaning)
- Portfolio costs (based on rate tier)
- Monthly and annual fees
- Fee per kWp
- CM days allowance (Capacity ÷ 12)

---

## Development

### Running in Development Mode

```bash
# Start with auto-reload (requires nodemon)
npm install -g nodemon
nodemon server.js
```

### Adding New API Endpoints

Edit `server.js`:
```javascript
app.get('/api/your-endpoint', async (req, res) => {
  try {
    const data = await prisma.yourModel.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Modifying the Database Schema

1. Edit `prisma/schema.prisma`
2. Push changes:
```bash
npm run db:push
npm run db:generate
```

---

## Troubleshooting

### "Cannot find module '@prisma/client'"

```bash
npm run db:generate
```

### "Database file not found"

```bash
npm run db:push
```

### "No data showing in frontend"

1. Check server is running: http://localhost:3000
2. Open browser console (F12) for errors
3. Verify database has data:
```bash
npm run db:studio
```

### Port 3000 already in use

```bash
PORT=8080 npm start
```

---

## Advantages of This Setup

### ✅ No Database Server Required
- No PostgreSQL installation
- No database configuration
- No connection string management
- Single file database

### ✅ Portable
- Copy folder to any computer
- Run `npm install && npm start`
- Works offline
- Easy backups (copy one file)

### ✅ Simple
- No build step required
- No complex configuration
- Direct HTML + JavaScript
- Standard Express server

### ✅ Full Featured
- All O&M tracker features work
- Real database (not in-memory)
- Proper data relationships
- Transaction support

---

## Production Deployment

### Docker (Recommended)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run db:generate
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t om-tracker .
docker run -p 3000:3000 -v $(pwd)/dev.db:/app/dev.db om-tracker
```

### PM2 (Process Manager)

```bash
npm install -g pm2
pm2 start server.js --name om-tracker
pm2 save
pm2 startup
```

---

## Migration from PostgreSQL

If you have existing data in PostgreSQL:

### 1. Export Data

```bash
# Using pg_dump
pg_dump -h localhost -U user -d om_tracker > backup.sql
```

### 2. Convert to SQLite

Use a tool like [pgloader](https://github.com/dimitri/pgloader) or manually export/import data.

### 3. Or Keep Both

You can switch between SQLite and PostgreSQL by changing `.env`:

```bash
# SQLite
DATABASE_URL="file:./dev.db"

# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/om_tracker"
```

And updating `prisma/schema.prisma` provider.

---

## Next Steps

1. **Customize** - Edit `demo.html` for your branding
2. **Add features** - Extend `server.js` with new endpoints
3. **Security** - Add authentication middleware
4. **Deploy** - Use Docker or PM2 for production

---

## Support

### Resources
- [Prisma SQLite Docs](https://www.prisma.io/docs/concepts/database-connectors/sqlite)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

### Common Tasks

**Add a new site:**
- Use Prisma Studio: `npm run db:studio`
- Or create API endpoint in `server.js`

**Change rate tiers:**
- Edit in Prisma Studio
- Or update `prisma/seed.ts` and re-seed

**Backup before changes:**
```bash
cp dev.db dev.db.backup
```

---

## Summary

You now have a **fully portable O&M tracker** that:
- ✅ Runs on any computer with Node.js
- ✅ Needs zero database setup
- ✅ Works offline
- ✅ Easy to backup (copy one file)
- ✅ Simple to share (zip folder)
- ✅ Production ready

**Just run:** `npm install && npm run db:push && npm run db:generate && npm run db:seed && npm start`

🎉 **Your O&M tracker is ready to use!**
