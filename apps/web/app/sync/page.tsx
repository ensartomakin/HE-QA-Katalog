'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
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

export default function SyncPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetchJson<{ runs: SyncRun[] }>('/api/sync/history'),
  });

  const runSync = useMutation({
    mutationFn: () => fetchJson('/api/sync/run', { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bilinmeyen hata'),
  });

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[25px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Senkronizasyon Yönetimi</h1>
          <button type="button" className="btn-ghost" onClick={() => runSync.mutate()} disabled={runSync.isPending}>
            {runSync.isPending ? 'Senkronize ediliyor…' : '→ Şimdi Senkronize Et'}
          </button>
        </div>

        <p className="text-[14px] text-[var(--color-bark)]">
          Senkron yalnızca bu buton ile manuel tetiklenir — stok ve ürün verisi otomatik/gerçek zamanlı güncellenmez (netleşti).
        </p>

        {error && <p className="text-[14px] text-red-700">{error}</p>}

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
    </main>
  );
}
