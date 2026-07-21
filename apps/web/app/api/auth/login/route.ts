import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json();
  let data: { token: string; user: { sub: string; email: string; name: string } };
  try {
    data = await workerFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Ayrım önemli: worker'a hiç ulaşılamaması / yanlış INTERNAL_API_KEY, gerçek bir
    // "şifre yanlış" durumundan farklı bir hatadır — kullanıcıyı yanlış yönlendirmemek
    // için ayrı bir mesajla gösterilir, teşhis edilebilsin diye tam detay loglanır.
    console.error('[auth/login]', message);
    if (message.includes('"error":"E-posta veya şifre hatalı."')) {
      return NextResponse.json({ error: 'E-posta veya şifre hatalı.' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Sunucu bağlantı hatası — worker\'a ulaşılamadı. (WORKER_URL / INTERNAL_API_KEY ayarlarını kontrol edin.)' },
      { status: 502 }
    );
  }

  const res = NextResponse.json({ ok: true, user: data.user });
  res.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
