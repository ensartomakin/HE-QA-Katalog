import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = await workerFetch('/api/settings/tsoft-credentials', { method: 'POST', body: JSON.stringify(body) });
  return NextResponse.json(data);
}
