'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import type { CatalogSummary } from '@/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
}

const STATUS_LABEL: Record<CatalogSummary['status'], string> = {
  DRAFT: 'Taslak',
  GENERATING: 'PDF üretiliyor…',
  READY: 'Hazır',
  FAILED: 'Hata',
};

export default function CatalogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['catalogs'],
    queryFn: () => fetchJson<{ catalogs: CatalogSummary[] }>('/api/catalogs'),
  });

  const catalogs = data?.catalogs ?? [];

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[25px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Katalog Geçmişi</h1>
          <Link href="/products" className="btn-ghost">
            → Yeni Katalog
          </Link>
        </div>

        {isLoading && <p className="text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>}

        {!isLoading && catalogs.length === 0 && (
          <p className="text-[14px] text-[var(--color-bark)]">
            Henüz katalog oluşturulmadı. Ürün Seçim Paneli'nden ürün seçip "Katalog Oluştur"a tıklayın.
          </p>
        )}

        <table className="w-full text-[14px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-pebble)] text-left">
              <th className="py-[9px] font-medium">Katalog</th>
              <th className="py-[9px] font-medium">Ürün Sayısı</th>
              <th className="py-[9px] font-medium">Para Birimi</th>
              <th className="py-[9px] font-medium">Durum</th>
              <th className="py-[9px] font-medium">Oluşturulma</th>
            </tr>
          </thead>
          <tbody>
            {catalogs.map((c) => (
              <tr key={c.id} className="border-b border-[var(--color-pebble)]">
                <td className="py-[9px]">
                  <Link href={`/catalogs/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="py-[9px]">{c._count.items}</td>
                <td className="py-[9px]">{c.currency}</td>
                <td className="py-[9px]">{STATUS_LABEL[c.status]}</td>
                <td className="py-[9px]">{new Date(c.createdAt).toLocaleDateString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
