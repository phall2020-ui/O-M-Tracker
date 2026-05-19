#!/usr/bin/env node

const appUrl = process.env.APP_URL || process.argv[2];

if (!appUrl) {
  console.error('Usage: APP_URL=https://... npm run smoke:prod');
  process.exit(1);
}

const baseUrl = appUrl.replace(/\/$/, '');
const roles = [
  ['ADMIN', process.env.SMOKE_ADMIN_EMAIL || 'admin@clearsol.co.uk', process.env.SMOKE_ADMIN_PASSWORD || 'admin123'],
  ['MANAGER', process.env.SMOKE_MANAGER_EMAIL || 'manager@clearsol.co.uk', process.env.SMOKE_MANAGER_PASSWORD || 'manager123'],
  ['CONTRACTOR', process.env.SMOKE_CONTRACTOR_EMAIL || 'contractor@clearsol.co.uk', process.env.SMOKE_CONTRACTOR_PASSWORD || 'contractor123'],
  ['VIEWER', process.env.SMOKE_VIEWER_EMAIL || 'viewer@clearsol.co.uk', process.env.SMOKE_VIEWER_PASSWORD || 'viewer123'],
];

async function assertFetch(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return response;
}

function cookieHeader(cookies) {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const csrf = await csrfResponse.json();
  const cookies = csrfResponse.headers.getSetCookie();
  const body = new URLSearchParams({
    email,
    password,
    csrfToken: csrf.csrfToken,
    callbackUrl: `${baseUrl}/`,
    json: 'true',
  });

  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(cookies),
    },
    body,
  });

  const sessionCookies = response.headers.getSetCookie();
  if (!sessionCookies.some((cookie) => cookie.includes('authjs.session-token'))) {
    throw new Error(`Login did not return a session cookie for ${email}; status ${response.status}`);
  }

  return cookieHeader([...cookies, ...sessionCookies]);
}

async function fetchJson(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}

async function assertWorkbook(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  const contentType = response.headers.get('content-type') || '';
  const disposition = response.headers.get('content-disposition') || '';
  const bytes = await response.arrayBuffer();

  if (response.status !== 200 || !contentType.includes('spreadsheetml.sheet') || !disposition.includes('.xlsx') || bytes.byteLength === 0) {
    throw new Error(`${path} export failed: status=${response.status}, type=${contentType}, disposition=${disposition}, bytes=${bytes.byteLength}`);
  }

  return bytes.byteLength;
}

await assertFetch('/login', 200);
await assertFetch('/', 307);

const health = await fetch(`${baseUrl}/api/health?deep=true`);
if (!health.ok) {
  throw new Error(`/api/health?deep=true returned ${health.status}: ${await health.text()}`);
}

for (const [role, email, password] of roles) {
  const cookie = await login(email, password);
  const session = await fetchJson('/api/auth/session', cookie);
  if (session.user?.role !== role) {
    throw new Error(`${email} authenticated as ${session.user?.role}; expected ${role}`);
  }

  const standardSize = await assertWorkbook('/api/export/excel', cookie);
  const customSize = await assertWorkbook('/api/export/excel?mode=custom&fields=name,spvCode,systemSizeKwp', cookie);
  console.log(`${role}: exports ok (${standardSize} / ${customSize} bytes)`);
}

console.log(`Production smoke checks passed for ${baseUrl}`);
