import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Oturum yok' }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
