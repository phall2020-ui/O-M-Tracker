# Historical SharePoint Lists Schema for O&M Tracker

> Historical note: this schema documents the earlier SharePoint-list prototype. The production platform now uses Azure SQL through Prisma. See `docs/azure-production.md`.

## Overview

This document describes the SharePoint Lists structure needed to run the O&M Portfolio Tracker entirely within SharePoint (no external database or server required).

---

## SharePoint Lists to Create

### 1. **Sites** List

**Purpose:** Store all solar site information

| Column Name | Type | Required | Notes |
|------------|------|----------|-------|
| Title | Single line of text | Yes | Site name (default SharePoint field) |
| SystemSizeKwp | Number | Yes | Decimal, 2 decimal places |
| SiteType | Choice | Yes | Choices: "Rooftop", "Ground Mount" |
| ContractStatus | Choice | Yes | Choices: "Yes", "No" |
| OnboardDate | Date and Time | No | Date only |
| PMCost | Currency | Yes | Default: 0 |
| CCTVCost | Currency | Yes | Default: 0 |
| CleaningCost | Currency | Yes | Default: 0 |
| SPVCode | Single line of text | No | Link to SPV (e.g., "OS2", "AD1") |
| SourceSheet | Single line of text | No | Import tracking |
| SourceRow | Number | No | Import tracking |

**PowerShell to create:**
```powershell
# Connect to SharePoint
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/yoursite" -Interactive

# Create Sites list
New-PnPList -Title "Sites" -Template GenericList

# Add columns
Add-PnPField -List "Sites" -DisplayName "SystemSizeKwp" -InternalName "SystemSizeKwp" -Type Number -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "SiteType" -InternalName "SiteType" -Type Choice -Choices "Rooftop","Ground Mount" -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "ContractStatus" -InternalName "ContractStatus" -Type Choice -Choices "Yes","No" -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "OnboardDate" -InternalName "OnboardDate" -Type DateTime -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "PMCost" -InternalName "PMCost" -Type Currency -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "CCTVCost" -InternalName "CCTVCost" -Type Currency -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "CleaningCost" -InternalName "CleaningCost" -Type Currency -AddToDefaultView
Add-PnPField -List "Sites" -DisplayName "SPVCode" -InternalName "SPVCode" -Type Text -AddToDefaultView
```

---

### 2. **SPVs** List

**Purpose:** Store Special Purpose Vehicle (company) information

| Column Name | Type | Required | Notes |
|------------|------|----------|-------|
| Title | Single line of text | Yes | SPV Code (e.g., "OS2", "AD1") |
| SPVName | Multiple lines of text | Yes | Full company name |

**PowerShell to create:**
```powershell
New-PnPList -Title "SPVs" -Template GenericList

Add-PnPField -List "SPVs" -DisplayName "SPVName" -InternalName "SPVName" -Type Note -AddToDefaultView
```

**Sample Data:**
```
Title: OS2
SPVName: Olympus Solar 2 Ltd

Title: AD1
SPVName: AMPYR Distributed Energy 1 Ltd

Title: FS
SPVName: Fylde Solar Ltd

Title: ESI8
SPVName: Eden Sustainable Investments 8 Ltd

Title: ESI1
SPVName: Eden Sustainable Investments 1 Ltd

Title: ESI10
SPVName: Eden Sustainable Investments 10 Ltd

Title: UV1
SPVName: ULTRAVOLT SPV1 LIMITED

Title: SKY
SPVName: Skylight Energy Ltd
```

---

### 3. **RateTiers** List

**Purpose:** Store pricing tiers based on portfolio capacity

| Column Name | Type | Required | Notes |
|------------|------|----------|-------|
| Title | Single line of text | Yes | Tier name (e.g., "<20MW") |
| MinCapacityMW | Number | Yes | Decimal, 2 places |
| MaxCapacityMW | Number | No | Decimal, 2 places (null for unlimited) |
| RatePerKwp | Currency | Yes | £/kWp rate |
| IsActive | Yes/No | Yes | Default: Yes |
| EffectiveFrom | Date and Time | Yes | Date only |

**PowerShell to create:**
```powershell
New-PnPList -Title "RateTiers" -Template GenericList

Add-PnPField -List "RateTiers" -DisplayName "MinCapacityMW" -InternalName "MinCapacityMW" -Type Number -AddToDefaultView
Add-PnPField -List "RateTiers" -DisplayName "MaxCapacityMW" -InternalName "MaxCapacityMW" -Type Number -AddToDefaultView
Add-PnPField -List "RateTiers" -DisplayName "RatePerKwp" -InternalName "RatePerKwp" -Type Currency -AddToDefaultView
Add-PnPField -List "RateTiers" -DisplayName "IsActive" -InternalName "IsActive" -Type Boolean -AddToDefaultView
Add-PnPField -List "RateTiers" -DisplayName "EffectiveFrom" -InternalName "EffectiveFrom" -Type DateTime -AddToDefaultView
```

**Sample Data:**
```
Title: <20MW
MinCapacityMW: 0
MaxCapacityMW: 20
RatePerKwp: £2.00
IsActive: Yes
EffectiveFrom: 2024-01-01

Title: 20-30MW
MinCapacityMW: 20
MaxCapacityMW: 30
RatePerKwp: £1.80
IsActive: Yes
EffectiveFrom: 2024-01-01

Title: 30-40MW
MinCapacityMW: 30
MaxCapacityMW: 40
RatePerKwp: £1.70
IsActive: Yes
EffectiveFrom: 2024-01-01
```

---

### 4. **CMDaysLog** List (Optional - for CM Days tracking)

**Purpose:** Track corrective maintenance work

| Column Name | Type | Required | Notes |
|------------|------|----------|-------|
| Title | Single line of text | Yes | Auto-generated or description |
| SiteName | Single line of text | Yes | Link to Sites list |
| WorkDate | Date and Time | Yes | Date only |
| Hours | Number | Yes | Decimal, 1 place |
| Days | Number | Yes | Calculated: Hours ÷ 8 |
| Description | Multiple lines of text | No | Work description |
| Technician | Single line of text | No | Technician name |

**PowerShell to create:**
```powershell
New-PnPList -Title "CMDaysLog" -Template GenericList

Add-PnPField -List "CMDaysLog" -DisplayName "SiteName" -InternalName "SiteName" -Type Text -AddToDefaultView
Add-PnPField -List "CMDaysLog" -DisplayName "WorkDate" -InternalName "WorkDate" -Type DateTime -AddToDefaultView
Add-PnPField -List "CMDaysLog" -DisplayName "Hours" -InternalName "Hours" -Type Number -AddToDefaultView
Add-PnPField -List "CMDaysLog" -DisplayName "Days" -InternalName "Days" -Type Calculated -Formula "=[Hours]/8" -AddToDefaultView
Add-PnPField -List "CMDaysLog" -DisplayName "Description" -InternalName "Description" -Type Note -AddToDefaultView
Add-PnPField -List "CMDaysLog" -DisplayName "Technician" -InternalName "Technician" -Type Text -AddToDefaultView
```

---

## SharePoint REST API Endpoints

### Read Sites
```javascript
const siteUrl = _spPageContextInfo.webAbsoluteUrl;
const endpoint = `${siteUrl}/_api/web/lists/getbytitle('Sites')/items?$select=*&$top=5000`;

fetch(endpoint, {
    headers: {
        'Accept': 'application/json;odata=verbose'
    }
})
.then(response => response.json())
.then(data => {
    const sites = data.d.results;
    console.log(sites);
});
```

### Create Site
```javascript
const newSite = {
    __metadata: { type: 'SP.Data.SitesListItem' },
    Title: 'New Solar Farm',
    SystemSizeKwp: 2500,
    SiteType: 'Ground Mount',
    ContractStatus: 'Yes',
    PMCost: 500,
    CCTVCost: 200,
    CleaningCost: 300,
    SPVCode: 'OS2'
};

fetch(`${siteUrl}/_api/web/lists/getbytitle('Sites')/items`, {
    method: 'POST',
    headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': document.getElementById('__REQUESTDIGEST').value
    },
    body: JSON.stringify(newSite)
});
```

### Update Site
```javascript
const updates = {
    __metadata: { type: 'SP.Data.SitesListItem' },
    SystemSizeKwp: 2600
};

fetch(`${siteUrl}/_api/web/lists/getbytitle('Sites')/items(${itemId})`, {
    method: 'POST',
    headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': document.getElementById('__REQUESTDIGEST').value,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE'
    },
    body: JSON.stringify(updates)
});
```

### Delete Site
```javascript
fetch(`${siteUrl}/_api/web/lists/getbytitle('Sites')/items(${itemId})`, {
    method: 'POST',
    headers: {
        'Accept': 'application/json;odata=verbose',
        'X-RequestDigest': document.getElementById('__REQUESTDIGEST').value,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'DELETE'
    }
});
```

---

## Permissions

### Required SharePoint Permissions

**For Read-Only Users:**
- Read permission on all lists

**For Contributors:**
- Contribute permission on Sites, CMDaysLog
- Read permission on SPVs, RateTiers

**For Admins:**
- Full Control on all lists

### Setting Permissions via PowerShell

```powershell
# Break permission inheritance
Set-PnPList -Identity "Sites" -BreakRoleInheritance -CopyRoleAssignments

# Grant permissions to a group
Set-PnPListPermission -Identity "Sites" -Group "O&M Managers" -AddRole "Contribute"
```

---

## Data Migration

### Import Sample Sites

```javascript
const sampleSites = [
    { Title: 'Meadow Solar Farm', SystemSizeKwp: 2450, ContractStatus: 'Yes', PMCost: 500, CCTVCost: 200, CleaningCost: 300, SPVCode: 'OS2' },
    { Title: 'Hilltop Energy Park', SystemSizeKwp: 1850, ContractStatus: 'Yes', PMCost: 450, CCTVCost: 150, CleaningCost: 250, SPVCode: 'AD1' },
    { Title: 'Valley View Solar', SystemSizeKwp: 3200, ContractStatus: 'Yes', PMCost: 600, CCTVCost: 250, CleaningCost: 400, SPVCode: 'OS2' }
];

sampleSites.forEach(site => {
    site.__metadata = { type: 'SP.Data.SitesListItem' };
    // POST each site to SharePoint
});
```

---

## Calculations in SharePoint

### Portfolio Capacity (Calculated in JavaScript)

```javascript
function calculatePortfolioCapacity(sites) {
    const totalKwp = sites.reduce((sum, site) => sum + site.SystemSizeKwp, 0);
    const contractedKwp = sites
        .filter(s => s.ContractStatus === 'Yes')
        .reduce((sum, site) => sum + site.SystemSizeKwp, 0);

    return {
        totalMW: totalKwp / 1000,
        contractedMW: contractedKwp / 1000
    };
}
```

### Rate Tier Determination

```javascript
function getRateTier(contractedMW, rateTiers) {
    const activeTiers = rateTiers.filter(t => t.IsActive);

    for (let tier of activeTiers.sort((a, b) => b.MinCapacityMW - a.MinCapacityMW)) {
        if (contractedMW >= tier.MinCapacityMW) {
            if (!tier.MaxCapacityMW || contractedMW < tier.MaxCapacityMW) {
                return tier;
            }
        }
    }

    return activeTiers[0]; // Default to lowest tier
}
```

### Site Fee Calculation

```javascript
function calculateSiteFees(site, ratePerKwp) {
    const siteFixedCosts = site.PMCost + site.CCTVCost + site.CleaningCost;
    const portfolioCost = site.SystemSizeKwp * ratePerKwp;
    const fixedFee = siteFixedCosts + portfolioCost;
    const monthlyFee = site.ContractStatus === 'Yes' ? fixedFee / 12 : 0;

    return {
        siteFixedCosts,
        portfolioCost,
        fixedFee,
        monthlyFee,
        feePerKwp: site.SystemSizeKwp > 0 ? monthlyFee / site.SystemSizeKwp : 0
    };
}
```

---

## Views to Create

### Sites - All Items
- Default view showing all columns

### Sites - Contracted Only
- Filter: ContractStatus = "Yes"
- Sort: Title ascending

### Sites - By SPV
- Group by: SPVCode
- Sort: SPVCode, then Title

### Sites - High Value
- Filter: SystemSizeKwp > 2000
- Sort: SystemSizeKwp descending

---

## Notes

1. **No Server Required** - All data stored in SharePoint Lists
2. **SharePoint Search** - Data is searchable via SharePoint search
3. **Version History** - Enable on Sites list for audit trail
4. **Excel Export** - Users can export to Excel natively
5. **Power Automate** - Can trigger flows on item creation/update
6. **Power BI** - Can connect directly to SharePoint Lists

---

## Alternative: Use Lookup Columns

For better data integrity, you can use SharePoint Lookup columns:

```powershell
# Add SPV as Lookup instead of text
Add-PnPField -List "Sites" -DisplayName "SPV" -InternalName "SPV" -Type Lookup -AddToDefaultView -Required $false -LookupList "SPVs" -LookupField "Title"
```

This creates a relationship between Sites and SPVs, similar to a foreign key in a database.
