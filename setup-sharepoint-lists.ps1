# ========================================
# O&M Portfolio Tracker - SharePoint Setup Script
# ========================================
# This script creates all required SharePoint Lists
# and populates them with sample data
# ========================================

param(
    [Parameter(Mandatory=$true)]
    [string]$SiteUrl
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "O&M Portfolio Tracker - SharePoint Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if PnP PowerShell is installed
if (!(Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "ERROR: PnP.PowerShell module not found!" -ForegroundColor Red
    Write-Host "Install it with: Install-Module -Name PnP.PowerShell -Force" -ForegroundColor Yellow
    exit 1
}

# Connect to SharePoint
Write-Host "Connecting to SharePoint site: $SiteUrl" -ForegroundColor Yellow
try {
    Connect-PnPOnline -Url $SiteUrl -Interactive
    Write-Host "✓ Connected successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Could not connect to SharePoint site" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# ========================================
# Create Sites List
# ========================================

Write-Host "Creating 'Sites' list..." -ForegroundColor Yellow

try {
    # Check if list already exists
    $existingList = Get-PnPList -Identity "Sites" -ErrorAction SilentlyContinue

    if ($existingList) {
        Write-Host "⚠ Sites list already exists. Skipping creation." -ForegroundColor Yellow
    } else {
        # Create list
        New-PnPList -Title "Sites" -Template GenericList -OnQuickLaunch | Out-Null

        # Add columns
        Add-PnPField -List "Sites" -DisplayName "SystemSizeKwp" -InternalName "SystemSizeKwp" -Type Number -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "SiteType" -InternalName "SiteType" -Type Choice -Choices "Rooftop","Ground Mount" -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "ContractStatus" -InternalName "ContractStatus" -Type Choice -Choices "Yes","No" -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "OnboardDate" -InternalName "OnboardDate" -Type DateTime -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "PMCost" -InternalName "PMCost" -Type Currency -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "CCTVCost" -InternalName "CCTVCost" -Type Currency -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "CleaningCost" -InternalName "CleaningCost" -Type Currency -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "SPVCode" -InternalName "SPVCode" -Type Text -AddToDefaultView | Out-Null
        Add-PnPField -List "Sites" -DisplayName "SourceSheet" -InternalName "SourceSheet" -Type Text | Out-Null
        Add-PnPField -List "Sites" -DisplayName "SourceRow" -InternalName "SourceRow" -Type Number | Out-Null

        # Enable versioning
        Set-PnPList -Identity "Sites" -EnableVersioning $true -MajorVersions 50 | Out-Null

        Write-Host "✓ Sites list created successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR creating Sites list:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# ========================================
# Create SPVs List
# ========================================

Write-Host "Creating 'SPVs' list..." -ForegroundColor Yellow

try {
    $existingList = Get-PnPList -Identity "SPVs" -ErrorAction SilentlyContinue

    if ($existingList) {
        Write-Host "⚠ SPVs list already exists. Skipping creation." -ForegroundColor Yellow
    } else {
        New-PnPList -Title "SPVs" -Template GenericList -OnQuickLaunch | Out-Null
        Add-PnPField -List "SPVs" -DisplayName "SPVName" -InternalName "SPVName" -Type Note -AddToDefaultView | Out-Null

        Write-Host "✓ SPVs list created successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR creating SPVs list:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# ========================================
# Create RateTiers List
# ========================================

Write-Host "Creating 'RateTiers' list..." -ForegroundColor Yellow

try {
    $existingList = Get-PnPList -Identity "RateTiers" -ErrorAction SilentlyContinue

    if ($existingList) {
        Write-Host "⚠ RateTiers list already exists. Skipping creation." -ForegroundColor Yellow
    } else {
        New-PnPList -Title "RateTiers" -Template GenericList -OnQuickLaunch | Out-Null
        Add-PnPField -List "RateTiers" -DisplayName "MinCapacityMW" -InternalName "MinCapacityMW" -Type Number -AddToDefaultView | Out-Null
        Add-PnPField -List "RateTiers" -DisplayName "MaxCapacityMW" -InternalName "MaxCapacityMW" -Type Number -AddToDefaultView | Out-Null
        Add-PnPField -List "RateTiers" -DisplayName "RatePerKwp" -InternalName "RatePerKwp" -Type Currency -AddToDefaultView | Out-Null
        Add-PnPField -List "RateTiers" -DisplayName "IsActive" -InternalName "IsActive" -Type Boolean -AddToDefaultView | Out-Null
        Add-PnPField -List "RateTiers" -DisplayName "EffectiveFrom" -InternalName "EffectiveFrom" -Type DateTime -AddToDefaultView | Out-Null

        Write-Host "✓ RateTiers list created successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR creating RateTiers list:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# ========================================
# Create CMDaysLog List (Optional)
# ========================================

Write-Host "Creating 'CMDaysLog' list (optional)..." -ForegroundColor Yellow

try {
    $existingList = Get-PnPList -Identity "CMDaysLog" -ErrorAction SilentlyContinue

    if ($existingList) {
        Write-Host "⚠ CMDaysLog list already exists. Skipping creation." -ForegroundColor Yellow
    } else {
        New-PnPList -Title "CMDaysLog" -Template GenericList -OnQuickLaunch | Out-Null
        Add-PnPField -List "CMDaysLog" -DisplayName "SiteName" -InternalName "SiteName" -Type Text -AddToDefaultView | Out-Null
        Add-PnPField -List "CMDaysLog" -DisplayName "WorkDate" -InternalName "WorkDate" -Type DateTime -AddToDefaultView | Out-Null
        Add-PnPField -List "CMDaysLog" -DisplayName "Hours" -InternalName "Hours" -Type Number -AddToDefaultView | Out-Null
        Add-PnPField -List "CMDaysLog" -DisplayName "Description" -InternalName "Description" -Type Note -AddToDefaultView | Out-Null
        Add-PnPField -List "CMDaysLog" -DisplayName "Technician" -InternalName "Technician" -Type Text -AddToDefaultView | Out-Null

        Write-Host "✓ CMDaysLog list created successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ CMDaysLog list creation failed (this is optional)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Importing Sample Data" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# Import SPVs
# ========================================

Write-Host "Importing SPVs..." -ForegroundColor Yellow

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

$imported = 0
foreach ($spv in $spvs) {
    try {
        # Check if SPV already exists
        $existing = Get-PnPListItem -List "SPVs" -Query "<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>$($spv.Title)</Value></Eq></Where></Query></View>"

        if ($existing.Count -eq 0) {
            Add-PnPListItem -List "SPVs" -Values $spv | Out-Null
            $imported++
        }
    } catch {
        Write-Host "  ⚠ Could not import SPV: $($spv.Title)" -ForegroundColor Yellow
    }
}

Write-Host "✓ Imported $imported SPVs" -ForegroundColor Green

# ========================================
# Import Rate Tiers
# ========================================

Write-Host "Importing Rate Tiers..." -ForegroundColor Yellow

$tiers = @(
    @{Title="<20MW"; MinCapacityMW=0; MaxCapacityMW=20; RatePerKwp=2.00; IsActive=$true; EffectiveFrom="2024-01-01"},
    @{Title="20-30MW"; MinCapacityMW=20; MaxCapacityMW=30; RatePerKwp=1.80; IsActive=$true; EffectiveFrom="2024-01-01"},
    @{Title="30-40MW"; MinCapacityMW=30; MaxCapacityMW=40; RatePerKwp=1.70; IsActive=$true; EffectiveFrom="2024-01-01"}
)

$imported = 0
foreach ($tier in $tiers) {
    try {
        $existing = Get-PnPListItem -List "RateTiers" -Query "<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>$($tier.Title)</Value></Eq></Where></Query></View>"

        if ($existing.Count -eq 0) {
            Add-PnPListItem -List "RateTiers" -Values $tier | Out-Null
            $imported++
        }
    } catch {
        Write-Host "  ⚠ Could not import tier: $($tier.Title)" -ForegroundColor Yellow
    }
}

Write-Host "✓ Imported $imported rate tiers" -ForegroundColor Green

# ========================================
# Import Sample Sites
# ========================================

Write-Host "Importing sample Sites..." -ForegroundColor Yellow

$sites = @(
    @{Title="Meadow Solar Farm"; SystemSizeKwp=2450; SiteType="Ground Mount"; ContractStatus="Yes"; OnboardDate="2023-01-15"; PMCost=500; CCTVCost=200; CleaningCost=300; SPVCode="OS2"},
    @{Title="Hilltop Energy Park"; SystemSizeKwp=1850; SiteType="Rooftop"; ContractStatus="Yes"; OnboardDate="2023-02-20"; PMCost=450; CCTVCost=150; CleaningCost=250; SPVCode="AD1"},
    @{Title="Valley View Solar"; SystemSizeKwp=3200; SiteType="Ground Mount"; ContractStatus="Yes"; OnboardDate="2023-03-10"; PMCost=600; CCTVCost=250; CleaningCost=400; SPVCode="OS2"},
    @{Title="Sunrise Industrial"; SystemSizeKwp=980; SiteType="Rooftop"; ContractStatus="Yes"; OnboardDate="2023-04-05"; PMCost=300; CCTVCost=100; CleaningCost=150; SPVCode="ESI8"},
    @{Title="Northfield Array"; SystemSizeKwp=1560; SiteType="Ground Mount"; ContractStatus="Yes"; OnboardDate="2023-05-18"; PMCost=400; CCTVCost=150; CleaningCost=200; SPVCode="FS"},
    @{Title="Greenacre Station"; SystemSizeKwp=2100; SiteType="Ground Mount"; ContractStatus="Yes"; OnboardDate="2023-06-22"; PMCost=480; CCTVCost=180; CleaningCost=280; SPVCode="ESI1"},
    @{Title="Riverside Solar"; SystemSizeKwp=890; SiteType="Rooftop"; ContractStatus="No"; PMCost=280; CCTVCost=80; CleaningCost=120; SPVCode="UV1"},
    @{Title="Lakeside Power"; SystemSizeKwp=1720; SiteType="Ground Mount"; ContractStatus="Yes"; OnboardDate="2023-08-14"; PMCost=420; CCTVCost=160; CleaningCost=220; SPVCode="SKY"}
)

$imported = 0
foreach ($site in $sites) {
    try {
        $existing = Get-PnPListItem -List "Sites" -Query "<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>$($site.Title)</Value></Eq></Where></Query></View>"

        if ($existing.Count -eq 0) {
            Add-PnPListItem -List "Sites" -Values $site | Out-Null
            $imported++
        }
    } catch {
        Write-Host "  ⚠ Could not import site: $($site.Title)" -ForegroundColor Yellow
    }
}

Write-Host "✓ Imported $imported sites" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✓ Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Upload 'demo-sharepoint.html' to your Site Assets library" -ForegroundColor White
Write-Host "2. Add the HTML file to a SharePoint page using the Embed web part" -ForegroundColor White
Write-Host "3. Test the app by opening the HTML file" -ForegroundColor White
Write-Host ""
Write-Host "Lists created at:" -ForegroundColor Cyan
Write-Host "  • $SiteUrl/Lists/Sites" -ForegroundColor White
Write-Host "  • $SiteUrl/Lists/SPVs" -ForegroundColor White
Write-Host "  • $SiteUrl/Lists/RateTiers" -ForegroundColor White
Write-Host ""
Write-Host "Happy tracking! 🎉" -ForegroundColor Green
