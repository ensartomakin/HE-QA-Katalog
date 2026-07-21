import { NextRequest, NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const data = await workerFetch(`/api/products/${params.id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data = await workerFetch(`/api/products/${params.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return NextResponse.json(data);
}
