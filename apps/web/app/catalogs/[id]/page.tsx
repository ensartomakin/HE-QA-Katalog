'use client';

import { useEffect, useState } from 'react';
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
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', params.id],
    queryFn: () => fetchJson<{ catalog: CatalogDetail }>(`/api/catalogs/${params.id}`),
    refetchInterval: (q) => (q.state.data?.catalog.status === 'GENERATING' ? 2000 : false),
  });

  const generate = useMutation({
    mutationFn: () => fetchJson(`/api/catalogs/${params.id}/generate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog', params.id] }),
  });

  const saveItemOrder = useMutation({
    mutationFn: (itemIds: string[]) =>
      fetchJson(`/api/catalogs/${params.id}/sort-order`, { method: 'PUT', body: JSON.stringify({ itemIds }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', params.id] });
      setPreviewTick((t) => t + 1);
    },
  });

  const saveCoverImage = useMutation({
    mutationFn: (coverImageUrl: string | null) =>
      fetchJson(`/api/catalogs/${params.id}`, { method: 'PATCH', body: JSON.stringify({ coverImageUrl }) }),
    onSuccess: () => {
      setCoverMessage('Kapak görseli kaydedildi.');
      queryClient.invalidateQueries({ queryKey: ['catalog', params.id] });
    },
    onError: (err) => setCoverMessage(err instanceof Error ? err.message : 'Kapak görseli kaydedilemedi'),
  });

  const catalog = data?.catalog;

  useEffect(() => {
    if (catalog?.coverImageUrl) setCoverPreview(catalog.coverImageUrl);
  }, [catalog?.coverImageUrl]);

  useEffect(() => {
    if (catalog) setItemOrder(catalog.items.map((item) => item.id));
  }, [catalog]);

  const itemById = new Map(catalog?.items.map((item) => [item.id, item]) ?? []);
  const orderedItems = itemOrder.map((id) => itemById.get(id)).filter((item): item is CatalogDetail['items'][number] => Boolean(item));

  function handleItemDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setItemOrder((prev) => {
      const next = prev.filter((id) => id !== dragId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, dragId);
      saveItemOrder.mutate(next);
      return next;
    });
    setDragId(null);
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverMessage(null);
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

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

            <div className="flex flex-col gap-[9px]">
              <h2 className="text-[21px]">Kapak Görseli</h2>
              <p className="text-[14px] text-[var(--color-bark)]">Kataloğun ilk (kapak) sayfasında kullanılır.</p>
              {coverPreview && (
                <div className="w-[200px] h-[280px] bg-[var(--color-linen)] flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="Kapak görseli önizleme" className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleCoverChange} className="text-[14px]" />
              <div className="flex gap-[11px]">
                <button
                  type="button"
                  className="btn-ghost self-start"
                  disabled={!coverPreview || saveCoverImage.isPending}
                  onClick={() => coverPreview && saveCoverImage.mutate(coverPreview)}
                >
                  {saveCoverImage.isPending ? 'Kaydediliyor…' : 'Kapak Görselini Kaydet'}
                </button>
                {catalog.coverImageUrl && (
                  <button
                    type="button"
                    className="btn-ghost self-start"
                    disabled={saveCoverImage.isPending}
                    onClick={() => {
                      setCoverPreview(null);
                      saveCoverImage.mutate(null);
                    }}
                  >
                    Kaldır
                  </button>
                )}
              </div>
              {coverMessage && <p className="text-[14px] text-[var(--color-bark)]">{coverMessage}</p>}
            </div>

            <div className="flex gap-[11px]">
              <button type="button" className="btn-ghost" onClick={() => setPreviewOpen(true)}>
                → Önizle
              </button>
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
              <p className="text-[14px] text-[var(--color-bark)]">Sırayı değiştirmek için satırları sürükleyip bırakın.</p>
              {orderedItems.map((item, i) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleItemDrop(item.id)}
                  onDragEnd={() => setDragId(null)}
                  style={{ opacity: dragId === item.id ? 0.4 : 1, cursor: 'grab' }}
                  className="flex items-center justify-between border-b border-[var(--color-pebble)] py-[9px] text-[14px]"
                >
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

      {previewOpen && catalog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-[25px]"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-[1400px] flex-col bg-[var(--color-bone-white)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-pebble)] px-[20px] py-[15px]">
              <div>
                <h2 className="text-[21px]">Önizleme</h2>
                <p className="text-[14px] text-[var(--color-bark)]">
                  {saveItemOrder.isPending ? 'Sıra kaydediliyor…' : 'Sırayı değiştirmek için ürünleri sürükleyip bırakın.'}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setPreviewOpen(false)}>
                ✕ Kapat
              </button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="flex w-[320px] flex-shrink-0 flex-col gap-[5px] overflow-y-auto border-r border-[var(--color-pebble)] p-[15px]">
                {orderedItems.map((item, i) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleItemDrop(item.id)}
                    onDragEnd={() => setDragId(null)}
                    style={{ opacity: dragId === item.id ? 0.4 : 1, cursor: 'grab' }}
                    className="flex items-center justify-between gap-[9px] border-b border-[var(--color-pebble)] py-[9px] text-[14px]"
                  >
                    <span>
                      {i + 1}. {item.product.name}
                    </span>
                    <span className="text-[var(--color-bark)]">⠿</span>
                  </div>
                ))}
              </div>
              <iframe
                key={previewTick}
                src={`/catalog-print/${catalog.id}?v=${previewTick}`}
                title="Katalog önizleme"
                className="h-full flex-1 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
