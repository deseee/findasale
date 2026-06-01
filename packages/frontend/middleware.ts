/**
 * #462/#463/#464 — UTM Parameter Preservation
 *
 * Root cause: Vercel's infrastructure-level trailing-slash redirect fires BEFORE
 * Next.js routing, stripping query params (including UTM) from the URL. By the
 * time React hydrates, window.location.search is empty.
 *
 * Fix: Middleware runs at the Edge BEFORE any redirect. When UTM params are present
 * in the incoming request URL, we write them to a short-lived cookie on the response.
 * The redirect follows, the browser carries the cookie to the destination, and
 * UTMCapture in _app.tsx reads the cookie as a fallback when window.location.search
 * is empty.
 *
 * Cookie: fsa_utm_pending — JSON, path=/, maxAge=300s (5 min), httpOnly=false (must
 * be readable by client JS), sameSite=lax, secure in production.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const utm_source = searchParams.get('utm_source');
  const utm_medium = searchParams.get('utm_medium');
  const utm_campaign = searchParams.get('utm_campaign');
  const utm_content = searchParams.get('utm_content');
  const ref = searchParams.get('ref');

  // Only act when at least one UTM param is present — skip all other requests
  if (!utm_source && !utm_medium && !utm_campaign && !utm_content) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const utmData = JSON.stringify({
    ...(utm_source ? { utm_source } : {}),
    ...(utm_medium ? { utm_medium } : {}),
    ...(utm_campaign ? { utm_campaign } : {}),
    ...(utm_content ? { utm_content } : {}),
    ...(ref ? { ref } : {}),
    captured_at: new Date().toISOString(),
  });

  // Set cookie on the response — survives any redirect chain that follows.
  // httpOnly: false is required so client-side UTMCapture can read it via document.cookie.
  // maxAge: 300 (5 min) — long enough to survive redirects, short enough to self-clean.
  response.cookies.set('fsa_utm_pending', utmData, {
    path: '/',
    maxAge: 300,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });

  return response;
}

export const config = {
  // Match all navigation routes. Exclude static assets, Next.js internals,
  // and service worker files to avoid unnecessary middleware overhead.
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
  ],
};
