export const DEFAULT_NOTION_BILLING_DATABASE_ID = '39212e37-c38b-4c79-b1cd-8e54c976f7ea';

type EnvironmentLike = Record<string, string | undefined>;

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function getEnvironmentReadiness(env: EnvironmentLike = process.env) {
  return {
    databaseUrl: hasValue(env.DATABASE_URL),
    nextAuthUrl: hasValue(env.NEXTAUTH_URL),
    nextAuthSecret: hasValue(env.AUTH_SECRET) || hasValue(env.NEXTAUTH_SECRET),
    notionToken: hasValue(env.NOTION_TOKEN),
    notionSitesDatabaseId: hasValue(env.NOTION_SITES_DATABASE_ID),
    notionBillingDatabaseId: hasValue(env.NOTION_BILLING_DATABASE_ID),
    notionBillingDatabaseUsesDefault: !hasValue(env.NOTION_BILLING_DATABASE_ID),
    notionSummaryPageId: hasValue(env.NOTION_SUMMARY_PAGE_ID),
    cronSecret: hasValue(env.CRON_SECRET),
  };
}

export function notionBillingDatabaseId(env: EnvironmentLike = process.env): string {
  return env.NOTION_BILLING_DATABASE_ID || DEFAULT_NOTION_BILLING_DATABASE_ID;
}
