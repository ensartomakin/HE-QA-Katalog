import { NextResponse } from 'next/server';
import { WorkerFetchError, workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await workerFetch(`/api/auth/users/${params.id}`, { method: 'DELETE' });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof WorkerFetchError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }
}
