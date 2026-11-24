import { NextResponse } from 'next/server';
import { workerFetch, WorkerFetchError } from '@/lib/worker-client';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await workerFetch(`/api/catalogs/${params.id}/pdf-status`);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof WorkerFetchError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'PDF üretim servisine ulaşılamadı.' }, { status: 502 });
  }
}
