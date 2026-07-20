import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function POST(_req: NextRequest, { params }: { params: { tsoftCategoryId: string } }) {
  const data = await workerFetch(`/api/sync/category/${encodeURIComponent(params.tsoftCategoryId)}`, { method: 'POST' });
  return NextResponse.json(data);
}
