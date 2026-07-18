'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
}

interface SyncRun {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  productsUpserted: number;
  productsMissing: number;
}

export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetchJson<{ runs: SyncRun[] }>('/api/sync/history'),
  });

  const lastRun = data?.runs?.[0];

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[34px]">
        <h1 className="text-[48px] leading-[0.97] tracking-[-0.036em]">Dashboard</h1>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-[25px]">
          <div className="flex flex-col gap-[5px]">
            <span className="text-[14px] text-[var(--color-bark)]">Son Senkronizasyon</span>
            <span className="text-[21px]">
              {lastRun ? new Date(lastRun.startedAt).toLocaleString('tr-TR') : 'Henüz çalıştırılmadı'}
            </span>
            {lastRun && (
              <span className="text-[14px] text-[var(--color-bark)]">
                {lastRun.status === 'SUCCESS'
                  ? `${lastRun.productsUpserted} ürün güncellendi, ${lastRun.productsMissing} ürün kaynakta bulunamadı`
                  : lastRun.status === 'RUNNING'
                    ? 'Devam ediyor…'
                    : 'Hata ile sonuçlandı'}
              </span>
            )}
          </div>

          <Link href="/products" className="flex flex-col gap-[5px]">
            <span className="text-[14px] text-[var(--color-bark)]">Katalog Oluştur</span>
            <span className="text-[21px] underline">Ürün Seçim Paneline Git →</span>
          </Link>

          <Link href="/sync" className="flex flex-col gap-[5px]">
            <span className="text-[14px] text-[var(--color-bark)]">tsoft Senkronizasyonu</span>
            <span className="text-[21px] underline">Senkronizasyon Yönetimine Git →</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
