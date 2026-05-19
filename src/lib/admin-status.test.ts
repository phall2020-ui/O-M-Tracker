import { describe, expect, it } from 'vitest';
import { getEnvironmentReadiness } from './admin-status';

describe('admin status environment readiness', () => {
  it('reports whether required variables are explicitly configured', () => {
    const readiness = getEnvironmentReadiness({
      DATABASE_URL: 'sqlserver://server.database.windows.net;database=om',
      NEXTAUTH_URL: 'http://localhost:3000',
      AUTH_SECRET: 'secret',
      NOTION_TOKEN: '',
      NOTION_BILLING_DATABASE_ID: '',
    });

    expect(readiness).toMatchObject({
      databaseUrl: true,
      nextAuthUrl: true,
      nextAuthSecret: true,
      notionToken: false,
      notionBillingDatabaseId: false,
      notionBillingDatabaseUsesDefault: true,
    });
  });
});
