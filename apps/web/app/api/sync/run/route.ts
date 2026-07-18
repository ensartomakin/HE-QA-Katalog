import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function POST() {
  const data = await workerFetch('/api/sync/run', { method: 'POST' });
  return NextResponse.json(data);
}
