import { NextRequest, NextResponse } from 'next/server';
import { WorkerFetchError, workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await workerFetch('/api/auth/users');
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const data = await workerFetch('/api/auth/users', { method: 'POST', body: JSON.stringify(body) });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof WorkerFetchError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }
}
