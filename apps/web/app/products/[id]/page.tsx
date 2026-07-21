'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import type { Product } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

const STOCK_LABEL: Record<Product['stockStatus'], string> = {
  IN_STOCK: 'Stokta',
  LOW_STOCK: 'Az Stok',
  OUT_OF_STOCK: 'Stok Yok',
  UNKNOWN: 'Bilinmiyor',
};

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [fabricInfo, setFabricInfo] = useState('');
  const [manualSortWeight, setManualSortWeight] = useState('');
  const [salesScore, setSalesScore] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [newSize, setNewSize] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['product', params.id],
    queryFn: () => fetchJson<{ product: Product }>(`/api/products/${params.id}`),
  });
  const product = data?.product;

  useEffect(() => {
    if (!product) return;
    setDescription(product.description ?? '');
    setFabricInfo(product.fabricInfo ?? '');
    setManualSortWeight(product.manualSortWeight?.toString() ?? '');
    setSalesScore(product.salesScore ?? '');
    setSizes(product.sizes.map((s) => s.label));
  }, [product]);

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/products/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: description || null,
          fabricInfo: fabricInfo || null,
          manualSortWeight: manualSortWeight ? Number(manualSortWeight) : null,
          salesScore: salesScore ? Number(salesScore) : null,
          sizes,
        }),
      }),
    onSuccess: () => {
      setMessage('Kaydedildi.');
      queryClient.invalidateQueries({ queryKey: ['product', params.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Kaydetme hatası'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  function addSize() {
    const label = newSize.trim();
    if (!label || sizes.includes(label)) return;
    setSizes((prev) => [...prev, label]);
    setNewSize('');
  }

  if (isLoading) {
    return (
      <main className="max-w-[1200px] mx-auto pb-[80px]">
        <TopNav />
        <p className="px-[17px] text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="max-w-[1200px] mx-auto pb-[80px]">
        <TopNav />
        <p className="px-[17px] text-[14px] text-[var(--color-bark)]">Ürün bulunamadı.</p>
      </main>
    );
  }

  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-[40px]">
        <div className="flex flex-col gap-[17px]">
          <div className="w-full aspect-[3/4] bg-[var(--color-linen)] overflow-hidden">
            {primaryImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primaryImage.url} alt={product.name} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="text-[14px] text-[var(--color-bark)]">Senkron alanları (salt-okunur)</div>
          <div className="text-[21px] leading-[1.2]">{product.name}</div>
          <div className="text-[14px] text-[var(--color-bark)]">{product.code}</div>
          <div className="text-[14px] text-[var(--color-bark)]">{product.category.name}</div>
          <div className="text-[14px] text-[var(--color-bark)]">{STOCK_LABEL[product.stockStatus]}</div>
          {product.colors.length > 0 && (
            <div className="flex gap-[5px]">
              {product.colors.map((c) => (
                <span
                  key={c.id}
                  title={c.name}
                  className="w-[14px] h-[14px] rounded-full border border-[var(--color-pebble)]"
                  style={{ backgroundColor: c.hexPreview ?? 'var(--color-linen)' }}
                />
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[25px] max-w-[600px]">
          <h1 className="text-[34px] leading-[1.08]">Ürün Detay</h1>

          <label className="flex flex-col gap-[5px] text-[14px]">
            Açıklama
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="border border-[var(--color-pebble)] bg-transparent p-[9px] text-[14px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-[5px] text-[14px]">
            Kumaş Bilgisi
            <input
              value={fabricInfo}
              onChange={(e) => setFabricInfo(e.target.value)}
              className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
            />
          </label>

          <div className="flex flex-col gap-[9px] text-[14px]">
            Bedenler
            <div className="flex flex-wrap gap-[9px]">
              {sizes.map((label) => (
                <span key={label} className="flex items-center gap-[5px] px-[9px] py-[2px] border border-[var(--color-pebble)] rounded-[20px]">
                  {label}
                  <button type="button" onClick={() => setSizes((prev) => prev.filter((s) => s !== label))} aria-label={`${label} bedenini kaldır`}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-[9px]">
              <input
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                placeholder="Örn: M, 38"
                className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
              />
              <button type="button" className="btn-ghost" onClick={addSize}>
                Ekle
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-[5px] text-[14px]">
            Manuel Sıralama Ağırlığı
            <input
              type="number"
              value={manualSortWeight}
              onChange={(e) => setManualSortWeight(e.target.value)}
              className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-[5px] text-[14px]">
            Satış Skoru (manuel override)
            <input
              type="number"
              value={salesScore}
              onChange={(e) => setSalesScore(e.target.value)}
              className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
            />
          </label>

          <button type="submit" className="btn-ghost self-start" disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {message && <p className="text-[14px] text-[var(--color-bark)]">{message}</p>}
        </form>
      </div>
    </main>
  );
}
