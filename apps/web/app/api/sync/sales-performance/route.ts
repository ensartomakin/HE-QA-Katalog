import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function POST() {
  const data = await workerFetch('/api/sync/sales-performance', { method: 'POST' });
  return NextResponse.json(data);
}
