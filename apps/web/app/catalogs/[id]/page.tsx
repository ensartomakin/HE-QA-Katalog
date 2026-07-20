'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import type { CatalogDetail } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

const STATUS_LABEL: Record<CatalogDetail['status'], string> = {
  DRAFT: 'Taslak',
  GENERATING: 'PDF üretiliyor…',
  READY: 'Hazır',
  FAILED: 'Hata',
};

export default function CatalogDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', params.id],
    queryFn: () => fetchJson<{ catalog: CatalogDetail }>(`/api/catalogs/${params.id}`),
    refetchInterval: (q) => (q.state.data?.catalog.status === 'GENERATING' ? 2000 : false),
  });

  const generate = useMutation({
    mutationFn: () => fetchJson(`/api/catalogs/${params.id}/generate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog', params.id] }),
  });

  const catalog = data?.catalog;

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[25px] max-w-[600px]">
        {isLoading && <p className="text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>}

        {catalog && (
          <>
            <div>
              <h1 className="text-[34px] leading-[1.08]">{catalog.name}</h1>
              <p className="text-[14px] text-[var(--color-bark)]">
                {catalog.items.length} ürün · {catalog.currency} · {STATUS_LABEL[catalog.status]}
              </p>
            </div>

            <div className="flex gap-[11px]">
              <a href={`/catalog-print/${catalog.id}`} target="_blank" rel="noreferrer" className="btn-ghost">
                → Önizle
              </a>
              <button type="button" className="btn-ghost" onClick={() => generate.mutate()} disabled={generate.isPending || catalog.status === 'GENERATING'}>
                {catalog.status === 'GENERATING' ? 'Üretiliyor…' : catalog.status === 'READY' ? 'Yeniden Üret' : '→ PDF Üret'}
              </button>
              {catalog.status === 'READY' && (
                <a href={`/api/catalogs/${catalog.id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost">
                  ↓ İndir
                </a>
              )}
            </div>

            {generate.isError && (
              <p className="text-[14px] text-red-700">{generate.error instanceof Error ? generate.error.message : 'PDF üretilemedi'}</p>
            )}
            {catalog.status === 'FAILED' && <p className="text-[14px] text-red-700">PDF üretimi başarısız oldu. Tekrar deneyin.</p>}

            <div className="flex flex-col gap-[9px]">
              <h2 className="text-[21px]">Ürünler</h2>
              {catalog.items.map((item, i) => (
                <div key={item.id} className="flex items-center justify-between border-b border-[var(--color-pebble)] py-[9px] text-[14px]">
                  <span>
                    {i + 1}. {item.product.name} — {item.product.code}
                  </span>
                  <span>{item.priceDisplay.toFixed(2)} {catalog.currency}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
