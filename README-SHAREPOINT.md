# O&M Portfolio Tracker - Historical SharePoint Deployment Guide

> Historical note: SharePoint was an earlier prototype deployment path. The production architecture now targets Next.js on Azure App Service with Azure SQL as the canonical store and one-way Notion summary sync. See `docs/azure-production.md`.

## Overview

This guide shows you how to deploy the O&M Portfolio Tracker to SharePoint **without any external servers or databases**. All data is stored in SharePoint Lists and the app runs entirely in the browser.

---

## ✅ Benefits of SharePoint Deployment

- **No external server** - Runs entirely in SharePoint
- **No database setup** - Uses SharePoint Lists
- **Built-in permissions** - Uses SharePoint security
- **Version history** - Automatic audit trail
- **Excel export** - Native SharePoint feature
- **Mobile friendly** - Works on SharePoint mobile app
- **Search integration** - Data is searchable
- **Power Automate** - Can trigger workflows

---

## 📋 Prerequisites

1. **SharePoint Site** (Modern or Classic)
2. **Permissions**: Site Owner or higher
3. **PowerShell** (for automated setup) OR Manual list creation

---

## 🚀 Quick Start (3 Steps)

### Step 1: Create SharePoint Lists

You have 2 options:

#### **Option A: Automated Setup (PowerShell)** ⭐ Recommended

```powershell
# 1. Install PnP PowerShell (if not already installed)
Install-Module -Name "PnP.PowerShell" -Force

# 2. Connect to your SharePoint site
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/yoursite" -Interactive

# 3. Run the setup script
.\setup-sharepoint-lists.ps1
```

#### **Option B: Manual Setup**

Follow the detailed steps in `SHAREPOINT-LISTS-SCHEMA.md` to create:
- **Sites** list
- **SPVs** list
- **RateTiers** list
- **CMDaysLog** list (optional)

### Step 2: Upload HTML File

1. Go to **Site Contents** → **Site Assets** (or create a Document Library)
2. Upload `demo-sharepoint.html`
3. Copy the file URL

### Step 3: Add to SharePoint Page

**Method 1: Embed Web Part**
1. Edit a SharePoint page
2. Add **Embed** web part
3. Paste the HTML file URL
4. Publish page

**Method 2: Link**
1. Add **Link** web part
2. Link directly to `demo-sharepoint.html`
3. Users click to open in new tab

**Method 3: IFrame (Classic Pages)**
```html
<iframe src="/sites/yoursite/SiteAssets/demo-sharepoint.html" width="100%" height="800px"></iframe>
```

---

## 📊 SharePoint Lists Structure

### 1. Sites List

| Column | Type | Required |
|--------|------|----------|
| Title | Text | Yes |
| SystemSizeKwp | Number | Yes |
| SiteType | Choice | Yes |
| ContractStatus | Choice | Yes |
| OnboardDate | Date | No |
| PMCost | Currency | Yes |
| CCTVCost | Currency | Yes |
| CleaningCost | Currency | Yes |
| SPVCode | Text | No |

### 2. SPVs List

| Column | Type | Required |
|--------|------|----------|
| Title | Text | Yes |
| SPVName | Note | Yes |

### 3. RateTiers List

| Column | Type | Required |
|--------|------|----------|
| Title | Text | Yes |
| MinCapacityMW | Number | Yes |
| MaxCapacityMW | Number | No |
| RatePerKwp | Currency | Yes |
| IsActive | Yes/No | Yes |
| EffectiveFrom | Date | Yes |

---

## 🔧 Configuration

### Update Site URL (if needed)

If you're testing locally or using a different SharePoint site:

1. Open `demo-sharepoint.html`
2. Find this line:
```javascript
const SP_CONFIG = {
    siteUrl: typeof _spPageContextInfo !== 'undefined' ? _spPageContextInfo.webAbsoluteUrl : window.location.origin,
```

3. For testing, hardcode your site URL:
```javascript
const SP_CONFIG = {
    siteUrl: 'https://yourtenant.sharepoint.com/sites/yoursite',
```

### Permissions

**Minimum Required:**
- **Readers**: Can view dashboard
- **Contributors**: Can add/edit sites
- **Owners**: Can manage lists and settings

**Recommended Setup:**
```powershell
# Break inheritance on sensitive lists
Set-PnPList -Identity "RateTiers" -BreakRoleInheritance -CopyRoleAssignments

# Grant Contributors access to Sites only
Set-PnPListPermission -Identity "Sites" -Group "O&M Contributors" -AddRole "Contribute"
Set-PnPListPermission -Identity "RateTiers" -Group "O&M Contributors" -AddRole "Read"
```

---

## 📥 Sample Data Import

### Import SPVs

```powershell
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/yoursite" -Interactive

$spvs = @(
    @{Title="OS2"; SPVName="Olympus Solar 2 Ltd"},
    @{Title="AD1"; SPVName="AMPYR Distributed Energy 1 Ltd"},
    @{Title="FS"; SPVName="Fylde Solar Ltd"},
    @{Title="ESI8"; SPVName="Eden Sustainable Investments 8 Ltd"},
    @{Title="ESI1"; SPVName="Eden Sustainable Investments 1 Ltd"},
    @{Title="ESI10"; SPVName="Eden Sustainable Investments 10 Ltd"},
    @{Title="UV1"; SPVName="ULTRAVOLT SPV1 LIMITED"},
    @{Title="SKY"; SPVName="Skylight Energy Ltd"}
)

foreach ($spv in $spvs) {
    Add-PnPListItem -List "SPVs" -Values $spv
}
```

### Import Rate Tiers

```powershell
$tiers = @(
    @{Title="<20MW"; MinCapacityMW=0; MaxCapacityMW=20; RatePerKwp=2.00; IsActive=$true; EffectiveFrom="2024-01-01"},
    @{Title="20-30MW"; MinCapacityMW=20; MaxCapacityMW=30; RatePerKwp=1.80; IsActive=$true; EffectiveFrom="2024-01-01"},
    @{Title="30-40MW"; MinCapacityMW=30; MaxCapacityMW=40; RatePerKwp=1.70; IsActive=$true; EffectiveFrom="2024-01-01"}
)

foreach ($tier in $tiers) {
    Add-PnPListItem -List "RateTiers" -Values $tier
}
```

### Import Sample Sites

```powershell
$sites = @(
    @{Title="Meadow Solar Farm"; SystemSizeKwp=2450; SiteType="Ground Mount"; ContractStatus="Yes"; PMCost=500; CCTVCost=200; CleaningCost=300; SPVCode="OS2"},
    @{Title="Hilltop Energy Park"; SystemSizeKwp=1850; SiteType="Rooftop"; ContractStatus="Yes"; PMCost=450; CCTVCost=150; CleaningCost=250; SPVCode="AD1"},
    @{Title="Valley View Solar"; SystemSizeKwp=3200; SiteType="Ground Mount"; ContractStatus="Yes"; PMCost=600; CCTVCost=250; CleaningCost=400; SPVCode="OS2"}
)

foreach ($site in $sites) {
    Add-PnPListItem -List "Sites" -Values $site
}
```

---

## 🎨 Customization

### Change Branding

Edit `demo-sharepoint.html`:

```html
<!-- Line ~70 -->
<div class="logo-text">Your Company Name</div>
```

### Add Logo

```html
<!-- Line ~60 -->
<div class="logo-icon">
    <img src="/sites/yoursite/SiteAssets/logo.png" alt="Logo" style="width: 40px;">
</div>
```

### Custom Colors

```css
/* Line ~12 */
:root {
    --bg: #f8fafc;
    --sidebar: #111827;  /* Change sidebar color */
    --blue: #3b82f6;     /* Change accent color */
    --green: #10b981;    /* Change success color */
    ...
}
```

---

## 🔍 Troubleshooting

### "List does not exist" error

**Cause:** SharePoint lists haven't been created yet

**Fix:**
1. Create the 3 required lists (Sites, SPVs, RateTiers)
2. Ensure list names match exactly (case-sensitive)
3. Check you're on the correct SharePoint site

### "Access denied" error

**Cause:** Insufficient permissions

**Fix:**
1. Ensure you have at least Read access to all lists
2. Check list-level permissions
3. Try opening the lists directly in SharePoint first

### Charts not showing

**Cause:** Chart.js not loading

**Fix:**
1. Check internet connection (Chart.js loads from CDN)
2. Or download Chart.js and host locally in SharePoint

### Data not loading

**Fix:**
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify SharePoint REST API is accessible
4. Test manually: `/sites/yoursite/_api/web/lists/getbytitle('Sites')/items`

---

## 📱 Mobile Support

The app is mobile-responsive and works on:
- SharePoint mobile app
- Mobile browsers
- Tablets

**Tip:** Pin the page to your SharePoint mobile app home screen for quick access.

---

## 🔗 Integration Options

### Power Automate

Trigger flows when sites are created/updated:

```
Trigger: When an item is created or modified (Sites list)
Action: Send email notification
Action: Update dashboard
Action: Log to audit trail
```

### Power BI

Connect Power BI to SharePoint Lists:

1. Get Data → SharePoint Online List
2. Enter site URL
3. Select Sites, SPVs, RateTiers lists
4. Create custom reports

### Excel

Export data:

1. Open Sites list
2. Click **Export to Excel**
3. Data updates dynamically

---

## 🔐 Security Best Practices

1. **Enable versioning** on Sites list for audit trail
2. **Break permission inheritance** on RateTiers (admin only)
3. **Enable item-level permissions** if needed
4. **Use SharePoint groups** for role management
5. **Enable alerts** for critical changes

```powershell
# Enable versioning
Set-PnPList -Identity "Sites" -EnableVersioning $true -MajorVersions 50

# Enable content approval (optional)
Set-PnPList -Identity "Sites" -EnableContentTypes $true -EnableModeration $true
```

---

## 📊 Advanced Features

### Add Site Create Form

Create a custom SharePoint Form using Power Apps:

1. Open Sites list
2. Click **Integrate** → **Power Apps** → **Create an app**
3. Customize form
4. Embed in dashboard

### Add Excel Import

Use Power Automate:

1. Trigger: When file is uploaded to Documents library
2. Parse Excel file
3. Create items in Sites list

### Real-time Updates

Use SignalR or polling:

```javascript
// Refresh data every 5 minutes
setInterval(async () => {
    await initializeApp();
}, 300000);
```

---

## 🎯 Next Steps

1. ✅ Create SharePoint Lists
2. ✅ Import sample data
3. ✅ Upload HTML file
4. ✅ Test in browser
5. ✅ Add to SharePoint page
6. ✅ Set permissions
7. ✅ Train users
8. ✅ Monitor and maintain

---

## 📚 Resources

- [SharePoint Lists Schema](./SHAREPOINT-LISTS-SCHEMA.md)
- [SharePoint REST API Docs](https://docs.microsoft.com/en-us/sharepoint/dev/sp-add-ins/get-to-know-the-sharepoint-rest-service)
- [PnP PowerShell](https://pnp.github.io/powershell/)
- [Modern SharePoint Pages](https://support.microsoft.com/en-us/office/add-sections-and-columns-on-a-page-fc491eb4-f733-4825-8fe2-e1ed80bd0899)

---

## 💡 Tips

- **Backup regularly**: Export lists to Excel weekly
- **Test changes**: Use a test SharePoint site first
- **Document customizations**: Keep track of changes
- **Monitor performance**: SharePoint has 5000 item list view threshold
- **Use views**: Create filtered views for better performance

---

## 🆘 Support

**Common Issues:**

| Issue | Solution |
|-------|----------|
| Slow loading | Enable list indexing on large lists |
| Charts broken | Check Chart.js CDN connection |
| Permissions error | Grant Read access to lists |
| Data not updating | Clear browser cache |
| Mobile issues | Check responsive CSS |

**Need Help?**

1. Check browser console for errors
2. Test SharePoint REST API manually
3. Verify list permissions
4. Check SharePoint site health

---

## ✨ Summary

You now have a **fully SharePoint-native O&M tracker** that:

- ✅ Requires zero external infrastructure
- ✅ Uses SharePoint Lists as database
- ✅ Runs entirely in the browser
- ✅ Integrates with SharePoint security
- ✅ Works on desktop and mobile
- ✅ Supports offline viewing (browser cache)

**Total Setup Time:** ~30 minutes

**Ongoing Maintenance:** Minimal (SharePoint handles it)

🎉 **Your O&M tracker is now running in SharePoint!**
