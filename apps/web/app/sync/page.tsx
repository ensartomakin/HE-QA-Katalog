'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

interface SyncRun {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  method: string;
  startedAt: string;
  finishedAt: string | null;
  productsUpserted: number;
  productsMissing: number;
  errorMessage: string | null;
}

interface MissingProduct {
  id: string;
  name: string;
  code: string;
  sourceMissingSince: string | null;
  missingSyncCount: number;
  archivedAt: string | null;
}

const MISSING_THRESHOLD = 3;

export default function SyncPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [salesMessage, setSalesMessage] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetchJson<{ runs: SyncRun[] }>('/api/sync/history'),
  });

  const { data: missingData } = useQuery({
    queryKey: ['missing-products'],
    queryFn: () => fetchJson<{ products: MissingProduct[] }>('/api/sync/missing-products'),
  });

  const runSync = useMutation({
    mutationFn: () => fetchJson('/api/sync/run', { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['missing-products'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bilinmeyen hata'),
  });

  const runSalesPerformance = useMutation({
    mutationFn: () => fetchJson<{ updated: number; matched: number }>('/api/sync/sales-performance', { method: 'POST' }),
    onSuccess: (res) => {
      setSalesMessage(`${res.matched} ürün için satış performansı güncellendi.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => setSalesMessage(err instanceof Error ? err.message : 'Bilinmeyen hata'),
  });

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[40px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Senkronizasyon Yönetimi</h1>
          <div className="flex gap-[11px]">
            <button type="button" className="btn-ghost" onClick={() => runSalesPerformance.mutate()} disabled={runSalesPerformance.isPending}>
              {runSalesPerformance.isPending ? 'Güncelleniyor…' : '→ Satış Performansını Güncelle (Son 30 Gün)'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => runSync.mutate()} disabled={runSync.isPending}>
              {runSync.isPending ? 'Senkronize ediliyor…' : '→ Şimdi Senkronize Et'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-[25px]">
          <p className="text-[14px] text-[var(--color-bark)]">
            Senkron yalnızca bu buton ile manuel tetiklenir — stok ve ürün verisi otomatik/gerçek zamanlı güncellenmez (netleşti).
          </p>

          {error && <p className="text-[14px] text-red-700">{error}</p>}
          {salesMessage && <p className="text-[14px] text-[var(--color-bark)]">{salesMessage}</p>}

          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-pebble)] text-left">
                <th className="py-[9px] font-medium">Başlangıç</th>
                <th className="py-[9px] font-medium">Durum</th>
                <th className="py-[9px] font-medium">Güncellenen</th>
                <th className="py-[9px] font-medium">Kaynakta Bulunamayan</th>
              </tr>
            </thead>
            <tbody>
              {(data?.runs ?? []).map((run) => (
                <tr key={run.id} className="border-b border-[var(--color-pebble)]">
                  <td className="py-[9px]">{new Date(run.startedAt).toLocaleString('tr-TR')}</td>
                  <td className="py-[9px]">{run.status}</td>
                  <td className="py-[9px]">{run.productsUpserted}</td>
                  <td className="py-[9px]">{run.productsMissing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">İncelenmesi Gereken Ürünler</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            Son senkronlarda tsoft kaynağında bulunamayan ürünler — {MISSING_THRESHOLD} ardışık senkrondan sonra otomatik arşivlenir.
          </p>
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-pebble)] text-left">
                <th className="py-[9px] font-medium">Ürün</th>
                <th className="py-[9px] font-medium">Kod</th>
                <th className="py-[9px] font-medium">Kaynakta Kayıp Tarihi</th>
                <th className="py-[9px] font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {(missingData?.products ?? []).map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-pebble)]">
                  <td className="py-[9px]">{p.name}</td>
                  <td className="py-[9px]">{p.code}</td>
                  <td className="py-[9px]">{p.sourceMissingSince ? new Date(p.sourceMissingSince).toLocaleDateString('tr-TR') : '—'}</td>
                  <td className="py-[9px]">
                    {p.archivedAt ? 'Arşivlendi' : `İzleniyor (${p.missingSyncCount}/${MISSING_THRESHOLD})`}
                  </td>
                </tr>
              ))}
              {(missingData?.products ?? []).length === 0 && (
                <tr>
                  <td className="py-[9px] text-[var(--color-bark)]" colSpan={4}>
                    İncelenmesi gereken ürün yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
