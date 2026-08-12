'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import type { CatalogDetail } from '@/lib/types';
import { upsizeTsoftImageUrl } from '@/lib/tsoft-image';

// Şablonlarda kullanılan varsayılanla aynı (bkz. editoryal Template.tsx DEFAULT_FOCAL_POINT) —
// manken fotoğraflarında kafa kırpılmasın diye üstte tutuluyor.
const DEFAULT_FOCAL_POINT = { x: 0.5, y: 0.15 };

type FocalEditorTarget = { itemId: string; imageUrl: string; label: string };

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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [variantOrderByItem, setVariantOrderByItem] = useState<Record<string, string[]>>({});
  const [dragVariantLabel, setDragVariantLabel] = useState<string | null>(null);
  const [focalEditor, setFocalEditor] = useState<FocalEditorTarget | null>(null);

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

  const saveVariantOrder = useMutation({
    mutationFn: ({ itemId, colorLabels }: { itemId: string; colorLabels: string[] }) =>
      fetchJson(`/api/catalogs/${params.id}/variant-order`, { method: 'PUT', body: JSON.stringify({ itemId, colorLabels }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', params.id] });
      setPreviewTick((t) => t + 1);
    },
  });

  const saveFocalPoint = useMutation({
    mutationFn: ({ itemId, imageUrl, x, y }: { itemId: string; imageUrl: string; x: number; y: number }) =>
      fetchJson(`/api/catalogs/${params.id}/focal-point`, { method: 'PUT', body: JSON.stringify({ itemId, imageUrl, x, y }) }),
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

  useEffect(() => {
    if (!catalog) return;
    setVariantOrderByItem((prev) => {
      const next = { ...prev };
      for (const item of catalog.items) {
        next[item.id] = item.colorVariants.map((v) => v.colorLabel);
      }
      return next;
    });
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

  function handleVariantDrop(itemId: string, targetLabel: string) {
    if (!dragVariantLabel || dragVariantLabel === targetLabel) return;
    setVariantOrderByItem((prev) => {
      const current = prev[itemId] ?? [];
      const next = current.filter((label) => label !== dragVariantLabel);
      const targetIndex = next.indexOf(targetLabel);
      next.splice(targetIndex, 0, dragVariantLabel);
      saveVariantOrder.mutate({ itemId, colorLabels: next });
      return { ...prev, [itemId]: next };
    });
    setDragVariantLabel(null);
  }

  function handleFocalPick(e: React.MouseEvent<HTMLDivElement>) {
    if (!focalEditor) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    saveFocalPoint.mutate({ itemId: focalEditor.itemId, imageUrl: focalEditor.imageUrl, x, y });
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
                  {saveItemOrder.isPending || saveVariantOrder.isPending || saveFocalPoint.isPending
                    ? 'Kaydediliyor…'
                    : 'Ürünleri sürükleyerek sırasını, "Görseller"i açıp galeri sırasını ve her fotoğrafın odak noktasını (🎯) değiştirebilirsiniz.'}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setPreviewOpen(false)}>
                ✕ Kapat
              </button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="flex w-[320px] flex-shrink-0 flex-col gap-[5px] overflow-y-auto border-r border-[var(--color-pebble)] p-[15px]">
                {orderedItems.map((item, i) => {
                  const variantOrder = variantOrderByItem[item.id] ?? item.colorVariants.map((v) => v.colorLabel);
                  const variantByLabel = new Map(item.colorVariants.map((v) => [v.colorLabel, v]));
                  const orderedVariants = variantOrder.map((label) => variantByLabel.get(label)).filter((v): v is CatalogDetail['items'][number]['colorVariants'][number] => Boolean(v));
                  const heroImage = item.product.images.find((im) => im.isPrimary) ?? item.product.images[0] ?? null;
                  const isExpanded = expandedItemId === item.id;
                  return (
                    <div key={item.id} className="border-b border-[var(--color-pebble)]">
                      <div
                        draggable
                        onDragStart={() => setDragId(item.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleItemDrop(item.id)}
                        onDragEnd={() => setDragId(null)}
                        style={{ opacity: dragId === item.id ? 0.4 : 1, cursor: 'grab' }}
                        className="flex items-center justify-between gap-[9px] py-[9px] text-[14px]"
                      >
                        <span>
                          {i + 1}. {item.product.name}
                        </span>
                        <div className="flex items-center gap-[9px] flex-shrink-0">
                          {(heroImage || orderedVariants.length > 0) && (
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                              className="text-[var(--color-bark)] underline-offset-4"
                              style={{ textDecoration: isExpanded ? 'underline' : 'none' }}
                            >
                              Görseller ({(heroImage ? 1 : 0) + orderedVariants.length})
                            </button>
                          )}
                          <span className="text-[var(--color-bark)]">⠿</span>
                        </div>
                      </div>
                      {isExpanded && (heroImage || orderedVariants.length > 0) && (
                        <div className="flex flex-wrap gap-[9px] pb-[11px]">
                          {heroImage && (
                            <div className="flex w-[70px] flex-col items-center gap-[3px]" title="Ana görsel">
                              <div className="relative h-[70px] w-[70px] bg-[var(--color-linen)] overflow-hidden flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={heroImage.url} alt={item.product.name} className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setFocalEditor({ itemId: item.id, imageUrl: heroImage.url, label: item.product.name })}
                                  className="absolute bottom-[2px] right-[2px] flex h-[20px] w-[20px] items-center justify-center bg-black/60 text-[11px] leading-none text-white"
                                  title="Odak noktasını ayarla"
                                >
                                  🎯
                                </button>
                              </div>
                              <span className="text-[11px] text-[var(--color-bark)] truncate w-full text-center">Ana görsel</span>
                            </div>
                          )}
                          {orderedVariants.map((v) => (
                            <div
                              key={v.colorLabel}
                              draggable
                              onDragStart={() => setDragVariantLabel(v.colorLabel)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleVariantDrop(item.id, v.colorLabel)}
                              onDragEnd={() => setDragVariantLabel(null)}
                              style={{ opacity: dragVariantLabel === v.colorLabel ? 0.4 : 1, cursor: 'grab' }}
                              className="flex w-[70px] flex-col items-center gap-[3px]"
                              title={v.colorLabel}
                            >
                              <div className="relative h-[70px] w-[70px] bg-[var(--color-linen)] overflow-hidden flex items-center justify-center">
                                {v.imageUrl && (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={v.imageUrl} alt={v.colorLabel} className="h-full w-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => setFocalEditor({ itemId: item.id, imageUrl: v.imageUrl as string, label: v.colorLabel })}
                                      className="absolute bottom-[2px] right-[2px] flex h-[20px] w-[20px] items-center justify-center bg-black/60 text-[11px] leading-none text-white"
                                      title="Odak noktasını ayarla"
                                    >
                                      🎯
                                    </button>
                                  </>
                                )}
                              </div>
                              <span className="text-[11px] text-[var(--color-bark)] truncate w-full text-center">{v.colorLabel}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {focalEditor && catalog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-[25px]"
          onClick={() => setFocalEditor(null)}
        >
          <div
            className="flex w-full max-w-[420px] flex-col gap-[11px] bg-[var(--color-bone-white)] p-[20px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[16px]">{focalEditor.label} — Odak Noktası</h3>
              <button type="button" className="btn-ghost" onClick={() => setFocalEditor(null)}>
                ✕
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-bark)]">
              Görselde kırpma sonrası görünmesini istediğiniz noktaya tıklayın (örn. mankenin kafası).
            </p>
            <div
              className="relative w-full cursor-crosshair bg-[var(--color-linen)] overflow-hidden"
              style={{ aspectRatio: '3 / 4' }}
              onClick={handleFocalPick}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upsizeTsoftImageUrl(focalEditor.imageUrl, 'O')}
                alt={focalEditor.label}
                className="h-full w-full object-cover pointer-events-none"
                style={{
                  objectPosition: `${(itemById.get(focalEditor.itemId)?.imageFocalPoints?.[focalEditor.imageUrl] ?? DEFAULT_FOCAL_POINT).x * 100}% ${
                    (itemById.get(focalEditor.itemId)?.imageFocalPoints?.[focalEditor.imageUrl] ?? DEFAULT_FOCAL_POINT).y * 100
                  }%`,
                }}
              />
              <div
                className="pointer-events-none absolute h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={{
                  left: `${(itemById.get(focalEditor.itemId)?.imageFocalPoints?.[focalEditor.imageUrl] ?? DEFAULT_FOCAL_POINT).x * 100}%`,
                  top: `${(itemById.get(focalEditor.itemId)?.imageFocalPoints?.[focalEditor.imageUrl] ?? DEFAULT_FOCAL_POINT).y * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => saveFocalPoint.mutate({ itemId: focalEditor.itemId, imageUrl: focalEditor.imageUrl, ...DEFAULT_FOCAL_POINT })}
              >
                Sıfırla
              </button>
              <p className="text-[13px] text-[var(--color-bark)]">{saveFocalPoint.isPending ? 'Kaydediliyor…' : 'Otomatik kaydedilir'}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
