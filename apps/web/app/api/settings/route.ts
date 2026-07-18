import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await workerFetch('/api/settings');
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const data = await workerFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  return NextResponse.json(data);
}
