@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Globally unique App Service name.')
param appName string

@description('Azure SQL logical server name. Must be globally unique.')
param sqlServerName string = '${appName}-sql'

@description('Azure SQL database name.')
param sqlDatabaseName string = 'om-tracker'

@description('SQL administrator login.')
param sqlAdminLogin string

@secure()
@description('SQL administrator password.')
param sqlAdminPassword string

@secure()
@description('NextAuth secret.')
param nextAuthSecret string

@secure()
@description('Notion integration token.')
param notionToken string

@description('Notion source Sites database ID used for bootstrap import.')
param notionSitesDatabaseId string

@description('Notion destination summary page ID.')
param notionSummaryPageId string

@secure()
@description('Shared secret for scheduled cron sync.')
param cronSecret string

@description('App Service Plan SKU.')
param appServiceSku string = 'B1'

@description('Deploy the daily Logic App scheduler. Requires Microsoft.Logic provider registration.')
param enableLogicApp bool = false

var appUrl = 'https://${appName}.azurewebsites.net'
var databaseUrl = 'sqlserver://${sqlServer.properties.fullyQualifiedDomainName}:1433;database=${sqlDatabaseName};user=${sqlAdminLogin};password=${sqlAdminPassword};encrypt=true;trustServerCertificate=false'

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlFirewallAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    maxSizeBytes: 2147483648
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm run start'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'DATABASE_URL', value: databaseUrl }
        { name: 'NEXTAUTH_URL', value: appUrl }
        { name: 'NEXTAUTH_SECRET', value: nextAuthSecret }
        { name: 'NOTION_TOKEN', value: notionToken }
        { name: 'NOTION_SITES_DATABASE_ID', value: notionSitesDatabaseId }
        { name: 'NOTION_SUMMARY_PAGE_ID', value: notionSummaryPageId }
        { name: 'CRON_SECRET', value: cronSecret }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
      ]
    }
  }
}

resource notionSyncWorkflow 'Microsoft.Logic/workflows@2019-05-01' = if (enableLogicApp) {
  name: '${appName}-daily-notion-sync'
  location: location
  properties: {
    state: 'Enabled'
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      triggers: {
        Daily: {
          type: 'Recurrence'
          recurrence: {
            frequency: 'Day'
            interval: 1
            schedule: {
              hours: [
                7
              ]
              minutes: [
                0
              ]
            }
          }
        }
      }
      actions: {
        Sync_Notion_Summary: {
          type: 'Http'
          inputs: {
            method: 'GET'
            uri: '${appUrl}/api/cron/notion-sync'
            headers: {
              'x-cron-secret': cronSecret
            }
          }
          runAfter: {}
        }
      }
      outputs: {}
    }
  }
}

output appUrl string = appUrl
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabase string = sqlDatabase.name
output notionSyncWorkflowName string = enableLogicApp ? notionSyncWorkflow.name : ''
