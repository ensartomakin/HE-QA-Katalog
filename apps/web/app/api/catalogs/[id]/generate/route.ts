import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const data = await workerFetch(`/api/catalogs/${params.id}/generate`, { method: 'POST' });
  return NextResponse.json(data);
}
