import { NextRequest, NextResponse } from 'next/server';
import { WorkerFetchError, workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  try {
    const data = await workerFetch(`/api/catalogs/${params.id}/focal-point`, { method: 'PUT', body: JSON.stringify(body) });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof WorkerFetchError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }
}
