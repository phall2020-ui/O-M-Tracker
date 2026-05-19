import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { canAccessPath, isAppRole } from './lib/permissions';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publicRoutes = ['/login', '/api/auth', '/api/cron', '/api/health'];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const isSecureRequest =
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https';

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie: isSecureRequest,
  });
  const isAuthenticated = Boolean(token);

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const role = isAppRole(token?.role) ? token.role : null;
  if (isAuthenticated && !pathname.startsWith('/api') && !canAccessPath(role, pathname)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth|api/health).*)',
  ],
};
