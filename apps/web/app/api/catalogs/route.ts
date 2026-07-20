import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await workerFetch('/api/catalogs');
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = await workerFetch('/api/catalogs', { method: 'POST', body: JSON.stringify(body) });
  return NextResponse.json(data);
}
