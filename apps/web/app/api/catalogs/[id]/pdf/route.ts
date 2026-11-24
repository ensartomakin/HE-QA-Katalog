import crypto from 'crypto';
import { NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const DOWNLOAD_LINK_TTL_MS = 5 * 60 * 1000;

// Büyük katalog PDF'leri Vercel fonksiyonlarının yanıt boyutu sınırını aşıyor. Bu yüzden
// dosya buradan geçirilmiyor: oturum kontrolünden (bkz. middleware.ts) sonra worker'a
// kısa ömürlü, imzalı bir indirme bağlantısına yönlendiriliyor.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'INTERNAL_API_KEY tanımlı değil.' }, { status: 500 });
  }

  const exp = String(Date.now() + DOWNLOAD_LINK_TTL_MS);
  const sig = crypto.createHmac('sha256', INTERNAL_API_KEY).update(`pdf-download:${params.id}:${exp}`).digest('hex');
  return NextResponse.redirect(`${WORKER_URL}/public/catalogs/${params.id}/pdf?exp=${exp}&sig=${sig}`, 302);
}
