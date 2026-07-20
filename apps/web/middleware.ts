import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// /catalog-print, Playwright'ın (worker'da çalışan) PDF üretirken ziyaret ettiği sayfa —
// tarayıcı oturumu taşımaz, bu yüzden bilinçli olarak oturum kontrolünden muaf tutuluyor.
// Kataloglar tahmin edilemez cuid id ile korunuyor (bkz. docs/SISTEM-TASARIMI.md §6, Faz 1
// için kabul edilebilir bir basitleştirme — üretimde imzalı/süreli bağlantıya evrilebilir).
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/bootstrap', '/api/auth/status', '/catalog-print'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
