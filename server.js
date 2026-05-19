const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper function to calculate fees
function calculateFees(site, portfolioCapacityMW) {
  const siteFixedCosts = site.pmCost + site.cctvCost + site.cleaningCost;

  // Determine rate tier
  let ratePerKwp = 2.00; // Default: <20MW
  if (portfolioCapacityMW >= 30) {
    ratePerKwp = 1.70; // 30-40MW
  } else if (portfolioCapacityMW >= 20) {
    ratePerKwp = 1.80; // 20-30MW
  }

  const portfolioCost = site.systemSizeKwp * ratePerKwp;
  const fixedFee = siteFixedCosts + portfolioCost;
  const monthlyFee = site.contractStatus === 'YES' ? fixedFee / 12 : 0;

  return {
    siteFixedCosts,
    portfolioCost,
    fixedFee,
    monthlyFee,
    feePerKwp: site.systemSizeKwp > 0 ? monthlyFee / site.systemSizeKwp : 0
  };
}

// API Routes

// Get portfolio summary
app.get('/api/portfolio', async (req, res) => {
  try {
    const sites = await prisma.site.findMany();

    const totalSites = sites.length;
    const contractedSites = sites.filter(s => s.contractStatus === 'YES');
    const totalCapacityKwp = sites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
    const contractedCapacityKwp = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
    const totalCapacityMW = totalCapacityKwp / 1000;
    const contractedCapacityMW = contractedCapacityKwp / 1000;

    // Calculate tier
    let currentTier = '<20MW';
    let ratePerKwp = 2.00;
    if (contractedCapacityMW >= 30) {
      currentTier = '30-40MW';
      ratePerKwp = 1.70;
    } else if (contractedCapacityMW >= 20) {
      currentTier = '20-30MW';
      ratePerKwp = 1.80;
    }

    // Calculate total revenue
    let totalMonthlyRevenue = 0;
    let totalAnnualRevenue = 0;

    contractedSites.forEach(site => {
      const fees = calculateFees(site, contractedCapacityMW);
      totalMonthlyRevenue += fees.monthlyFee;
    });

    totalAnnualRevenue = totalMonthlyRevenue * 12;

    res.json({
      totalSites,
      contractedSites: contractedSites.length,
      totalCapacityMW,
      contractedCapacityMW,
      currentTier,
      ratePerKwp,
      totalMonthlyRevenue,
      totalAnnualRevenue
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all sites
app.get('/api/sites', async (req, res) => {
  try {
    const sites = await prisma.site.findMany({
      include: {
        spv: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Calculate portfolio capacity for fee calculations
    const contractedSites = sites.filter(s => s.contractStatus === 'YES');
    const contractedCapacityMW = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0) / 1000;

    // Add calculated fees to each site
    const sitesWithFees = sites.map(site => {
      const fees = calculateFees(site, contractedCapacityMW);
      return {
        ...site,
        ...fees,
        contract: site.contractStatus === 'YES' ? 'Yes' : 'No',
        spvCode: site.spv?.code || null
      };
    });

    res.json(sitesWithFees);
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get SPV summary
app.get('/api/spvs/summary', async (req, res) => {
  try {
    const spvs = await prisma.sPV.findMany({
      include: {
        sites: true
      }
    });

    const summary = spvs.map(spv => {
      const totalSites = spv.sites.length;
      const contractedSites = spv.sites.filter(s => s.contractStatus === 'YES');
      const totalCapacity = spv.sites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
      const contractedCapacity = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0);

      // Calculate revenue
      const contractedCapacityMW = contractedCapacity / 1000;
      let revenue = 0;
      contractedSites.forEach(site => {
        const fees = calculateFees(site, contractedCapacityMW);
        revenue += fees.monthlyFee;
      });

      return {
        code: spv.code,
        name: spv.name,
        sites: totalSites,
        contracted: contractedSites.length,
        capacity: totalCapacity,
        revenue: Math.round(revenue * 100) / 100
      };
    });

    res.json(summary);
  } catch (error) {
    console.error('Error fetching SPV summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const sites = await prisma.site.findMany({
      include: {
        spv: true
      }
    });

    const contractedSites = sites.filter(s => s.contractStatus === 'YES');
    const contractedCapacityMW = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0) / 1000;

    // Calculate top sites by revenue
    const sitesWithFees = contractedSites.map(site => {
      const fees = calculateFees(site, contractedCapacityMW);
      return {
        name: site.name,
        spv: site.spv?.code || 'N/A',
        size: site.systemSizeKwp,
        monthlyFee: fees.monthlyFee
      };
    });

    const topSites = sitesWithFees
      .sort((a, b) => b.monthlyFee - a.monthlyFee)
      .slice(0, 5);

    // Generate revenue trend (mock data for now)
    const revenueTrend = Array.from({ length: 12 }, (_, i) => ({
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      revenue: 28000 + (i * 900) + Math.random() * 500
    }));

    res.json({
      topSites,
      revenueTrend,
      contractStatus: {
        contracted: contractedSites.length,
        notContracted: sites.length - contractedSites.length
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the HTML frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'demo.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ O&M Tracker server running at http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite (file: ./dev.db)`);
  console.log(`🎨 Frontend: HTML + JavaScript`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});
