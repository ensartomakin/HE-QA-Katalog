import { NextResponse } from 'next/server';
import { workerFetch, WorkerFetchError } from '@/lib/worker-client';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await workerFetch(`/api/catalogs/${params.id}/generate`, { method: 'POST' });
    return NextResponse.json(data, { status: 202 });
  } catch (err) {
    if (err instanceof WorkerFetchError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'PDF üretim servisine ulaşılamadı.' }, { status: 502 });
  }
}
