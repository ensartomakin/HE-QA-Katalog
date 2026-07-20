'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import { useCatalogSelection } from '@/lib/catalog-selection.store';
import type { CatalogCurrency, Product } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

export default function NewCatalogPage() {
  const router = useRouter();
  const selection = useCatalogSelection();
  const [orderedIds, setOrderedIds] = useState<string[]>(() => Array.from(selection.selectedIds));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['products', 'byIds', orderedIds.join(',')],
    queryFn: () => fetchJson<{ products: Product[] }>(`/api/products?ids=${orderedIds.join(',')}`),
    enabled: orderedIds.length > 0,
  });
  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson<{ user: { email: string } }>('/api/auth/me') });

  const productById = new Map((data?.products ?? []).map((p) => [p.id, p]));

  useEffect(() => {
    // Sayfa açıldığında seçim boşsa Ürün Seçim Paneli'ne dön.
    if (orderedIds.length === 0) router.replace('/products');
  }, [orderedIds.length, router]);

  function move(index: number, dir: -1 | 1) {
    setOrderedIds((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(id: string) {
    setOrderedIds((prev) => prev.filter((x) => x !== id));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const { catalog } = await fetchJson<{ catalog: { id: string } }>('/api/catalogs', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          coverTitle: String(form.get('coverTitle') ?? '') || undefined,
          coverSubtitle: String(form.get('coverSubtitle') ?? '') || undefined,
          currency: String(form.get('currency') ?? 'TRY') as CatalogCurrency,
          productIds: orderedIds,
          createdBy: meData?.user.email ?? 'bilinmiyor',
        }),
      });
      selection.clear();
      router.push(`/catalogs/${catalog.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Katalog oluşturulamadı');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[34px]">
        <h1 className="text-[34px] leading-[1.08]">Katalog Oluşturucu</h1>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-[40px]">
          <div className="flex flex-col gap-[17px]">
            <label className="flex flex-col gap-[5px] text-[14px]">
              Katalog Adı
              <input name="name" required placeholder="2024/2025 Yeni Sezon" className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] outline-none" />
            </label>
            <label className="flex flex-col gap-[5px] text-[14px]">
              Kapak Başlığı (opsiyonel)
              <input name="coverTitle" placeholder="KATALOG" className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] outline-none" />
            </label>
            <label className="flex flex-col gap-[5px] text-[14px]">
              Kapak Alt Başlığı (opsiyonel)
              <input name="coverSubtitle" placeholder="Zamansız tasarımlar, konfor ve şıklık bir arada." className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] outline-none" />
            </label>
            <label className="flex flex-col gap-[5px] text-[14px]">
              Para Birimi
              <select name="currency" defaultValue="TRY" className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] outline-none">
                <option value="TRY">TRY</option>
                <option value="USD">USD (Ayarlar'da kur girilmiş olmalı)</option>
                <option value="EUR">EUR (Ayarlar'da kur girilmiş olmalı)</option>
              </select>
            </label>

            {error && <p className="text-[14px] text-red-700">{error}</p>}

            <button type="submit" className="btn-ghost justify-center" disabled={saving || orderedIds.length === 0}>
              {saving ? 'Kaydediliyor…' : `→ Kaydet (${orderedIds.length} ürün)`}
            </button>
          </div>

          <div className="flex flex-col gap-[9px]">
            <h2 className="text-[21px]">Seçili Ürünler ({orderedIds.length})</h2>
            {orderedIds.map((id, i) => {
              const p = productById.get(id);
              const img = p?.images.find((im) => im.isPrimary) ?? p?.images[0];
              return (
                <div key={id} className="flex items-center gap-[15px] border-b border-[var(--color-pebble)] py-[9px]">
                  <span className="text-[14px] text-[var(--color-bark)] w-[20px]">{i + 1}</span>
                  <div className="w-[50px] h-[65px] bg-[var(--color-linen)] shrink-0 overflow-hidden">
                    {img && <img src={img.url} alt={p?.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 text-[14px]">
                    <div>{p?.name ?? '…'}</div>
                    <div className="text-[var(--color-bark)]">{p?.code}</div>
                  </div>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[14px] px-[5px] disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === orderedIds.length - 1} className="text-[14px] px-[5px] disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" onClick={() => remove(id)} className="text-[14px] px-[5px]">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </form>
      </div>
    </main>
  );
}
