import { NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// PDF binary'sini worker'dan alıp tarayıcıya aktarır — worker'ın hiçbir zaman doğrudan
// tarayıcıdan erişilebilir olmaması gerektiği için (bkz. docs/SISTEM-TASARIMI.md §6),
// dosya indirmesi de bu proxy üzerinden geçer.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'INTERNAL_API_KEY tanımlı değil.' }, { status: 500 });
  }

  const res = await fetch(`${WORKER_URL}/api/catalogs/${params.id}/pdf`, {
    headers: { 'x-internal-key': INTERNAL_API_KEY },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'PDF bulunamadı' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="katalog-${params.id}.pdf"`,
    },
  });
}
