import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await workerFetch('/api/sync/history');
  return NextResponse.json(data);
}
