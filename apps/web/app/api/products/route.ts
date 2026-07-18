import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  const data = await workerFetch(`/api/products${qs}`);
  return NextResponse.json(data);
}
