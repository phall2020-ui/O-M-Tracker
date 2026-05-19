// ========================================
// SHAREPOINT REST API INTEGRATION
// O&M Portfolio Tracker - SharePoint Version
// ========================================

// SharePoint Context
const SP_CONFIG = {
    siteUrl: typeof _spPageContextInfo !== 'undefined' ? _spPageContextInfo.webAbsoluteUrl : window.location.origin,
    listsUrl: typeof _spPageContextInfo !== 'undefined' ? _spPageContextInfo.webAbsoluteUrl + '/_api/web/lists' : '/_api/web/lists'
};

// Global Data Storage
let sites = [];
let spvs = [];
let rateTiers = [];
let portfolio = {};
let dashboard = {};

// Get Request Digest for POST/UPDATE/DELETE operations
function getRequestDigest() {
    const digestElement = document.getElementById('__REQUESTDIGEST');
    if (digestElement) {
        return digestElement.value;
    }
    // Fallback: Fetch new digest
    return fetch(SP_CONFIG.siteUrl + '/_api/contextinfo', {
        method: 'POST',
        headers: {
            'Accept': 'application/json;odata=verbose'
        }
    })
    .then(r => r.json())
    .then(d => d.d.GetContextWebInformation.FormDigestValue);
}

// Generic SharePoint GET request
async function spGet(listName, query = '') {
    const url = `${SP_CONFIG.listsUrl}/getbytitle('${listName}')/items${query ? '?' + query : '?$top=5000'}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json;odata=verbose'
            }
        });

        if (!response.ok) {
            throw new Error(`SharePoint API error: ${response.status}`);
        }

        const data = await response.json();
        return data.d.results;
    } catch (error) {
        console.error(`Error fetching from ${listName}:`, error);
        return [];
    }
}

// Load Sites from SharePoint
async function loadSites() {
    const spSites = await spGet('Sites', '$select=*&$top=5000&$orderby=Title');

    sites = spSites.map(site => ({
        id: site.ID,
        name: site.Title,
        systemSizeKwp: site.SystemSizeKwp || 0,
        siteType: site.SiteType || 'Rooftop',
        contractStatus: site.ContractStatus || 'NO',
        contract: site.ContractStatus === 'Yes' ? 'Yes' : 'No',
        onboardDate: site.OnboardDate,
        pmCost: site.PMCost || 0,
        cctvCost: site.CCTVCost || 0,
        cleaningCost: site.CleaningCost || 0,
        spvCode: site.SPVCode || null
    }));

    return sites;
}

// Load SPVs from SharePoint
async function loadSPVs() {
    const spSPVs = await spGet('SPVs', '$select=*&$orderby=Title');

    spvs = spSPVs.map(spv => ({
        code: spv.Title,
        name: spv.SPVName || spv.Title
    }));

    return spvs;
}

// Load Rate Tiers from SharePoint
async function loadRateTiers() {
    const spTiers = await spGet('RateTiers', '$select=*&$filter=IsActive eq true&$orderby=MinCapacityMW desc');

    rateTiers = spTiers.map(tier => ({
        tierName: tier.Title,
        minCapacityMW: tier.MinCapacityMW || 0,
        maxCapacityMW: tier.MaxCapacityMW,
        ratePerKwp: tier.RatePerKwp || 2.00,
        isActive: tier.IsActive
    }));

    return rateTiers;
}

// Get applicable rate tier for given capacity
function getRateTier(contractedMW) {
    for (let tier of rateTiers) {
        if (contractedMW >= tier.minCapacityMW) {
            if (!tier.maxCapacityMW || contractedMW < tier.maxCapacityMW) {
                return tier;
            }
        }
    }
    return rateTiers[rateTiers.length - 1] || { tierName: '<20MW', ratePerKwp: 2.00 };
}

// Calculate fees for a site
function calculateSiteFees(site, ratePerKwp) {
    const siteFixedCosts = site.pmCost + site.cctvCost + site.cleaningCost;
    const portfolioCost = site.systemSizeKwp * ratePerKwp;
    const fixedFee = siteFixedCosts + portfolioCost;
    const monthlyFee = site.contract === 'Yes' ? fixedFee / 12 : 0;

    return {
        siteFixedCosts,
        portfolioCost,
        fixedFee,
        monthlyFee
    };
}

// Calculate portfolio summary
function calculatePortfolio() {
    const totalSites = sites.length;
    const contractedSites = sites.filter(s => s.contract === 'Yes');
    const totalCapacityKwp = sites.reduce((sum, s) => sum + s.systemSizeKwp, 0);
    const contractedCapacityKwp = contractedSites.reduce((sum, s) => sum + s.systemSizeKwp, 0);

    const totalCapacityMW = totalCapacityKwp / 1000;
    const contractedCapacityMW = contractedCapacityKwp / 1000;

    const tier = getRateTier(contractedCapacityMW);

    let totalMonthlyRevenue = 0;
    contractedSites.forEach(site => {
        const fees = calculateSiteFees(site, tier.ratePerKwp);
        totalMonthlyRevenue += fees.monthlyFee;
    });

    portfolio = {
        totalSites,
        contractedSites: contractedSites.length,
        totalCapacityMW,
        contractedCapacityMW,
        currentTier: tier.tierName,
        ratePerKwp: tier.ratePerKwp,
        totalMonthlyRevenue,
        totalAnnualRevenue: totalMonthlyRevenue * 12
    };

    return portfolio;
}

// Calculate dashboard data
function calculateDashboard() {
    const tier = getRateTier(portfolio.contractedCapacityMW);

    sites.forEach(site => {
        const fees = calculateSiteFees(site, tier.ratePerKwp);
        Object.assign(site, fees);
    });

    const topSites = sites
        .filter(s => s.contract === 'Yes')
        .sort((a, b) => b.monthlyFee - a.monthlyFee)
        .slice(0, 5)
        .map(s => ({
            name: s.name,
            spv: s.spvCode || 'N/A',
            size: s.systemSizeKwp,
            monthlyFee: s.monthlyFee
        }));

    const revenueTrend = Array.from({ length: 12 }, (_, i) => ({
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
        revenue: portfolio.totalMonthlyRevenue * (0.7 + (i * 0.025))
    }));

    dashboard = {
        topSites,
        revenueTrend,
        contractStatus: {
            contracted: portfolio.contractedSites,
            notContracted: portfolio.totalSites - portfolio.contractedSites
        }
    };

    const spvSummary = {};
    sites.forEach(site => {
        const code = site.spvCode || 'Unknown';
        if (!spvSummary[code]) {
            spvSummary[code] = {
                code,
                name: spvs.find(s => s.code === code)?.name || code,
                sites: 0,
                contracted: 0,
                capacity: 0,
                revenue: 0
            };
        }

        spvSummary[code].sites++;
        spvSummary[code].capacity += site.systemSizeKwp;

        if (site.contract === 'Yes') {
            spvSummary[code].contracted++;
            spvSummary[code].revenue += site.monthlyFee || 0;
        }
    });

    spvs = Object.values(spvSummary);
    return dashboard;
}

// Main initialization
async function initializeApp() {
    try {
        console.log('Loading data from SharePoint...');

        await Promise.all([
            loadSites(),
            loadSPVs(),
            loadRateTiers()
        ]);

        calculatePortfolio();
        calculateDashboard();

        console.log('✅ Data loaded successfully from SharePoint');
        console.log(`Sites: ${sites.length}, SPVs: ${spvs.length}, Tiers: ${rateTiers.length}`);
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Error loading data from SharePoint. Please check that the lists exist and you have access.');
    }
}
