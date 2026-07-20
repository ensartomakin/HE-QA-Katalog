import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = await workerFetch(`/api/catalogs/${params.id}`);
  return NextResponse.json(data);
}
