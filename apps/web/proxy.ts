import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'sugami_session';

/**
 * Redirect to /login when there is no session cookie. The API still validates the session on
 * every request; this only avoids rendering app pages for signed-out visitors.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === '/login') {
    return hasSession ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals, static files and the PWA files.
  matcher: ['/((?!api/|_next/|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
};
