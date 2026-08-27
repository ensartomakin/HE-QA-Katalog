'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CATALOG_TEMPLATES, DEFAULT_CATALOG_TEMPLATE_ID } from '@he-qa/db';
import { TopNav } from '@/components/TopNav';
import { useCatalogSelection } from '@/lib/catalog-selection.store';
import type { CatalogCurrency, Product } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

interface ExtraTitle {
  id: string;
  text: string;
}

export default function NewCatalogPage() {
  const router = useRouter();
  const selection = useCatalogSelection();
  const [orderedIds, setOrderedIds] = useState<string[]>(() => Array.from(selection.selectedIds));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<CatalogCurrency>('TRY');
  const [templateId, setTemplateId] = useState<string>(DEFAULT_CATALOG_TEMPLATE_ID);
  // Katalog Adı dışında, sayfa bazlı gösterilebilecek ek başlıklar (bkz. "artırılabilir
  // katalog adı" özelliği) — her ürün, Seçili Ürünler listesindeki açılır menüden bu
  // başlıklardan birine (ya da varsayılan olarak Katalog Adı'na) atanabilir.
  const [extraTitles, setExtraTitles] = useState<ExtraTitle[]>([]);
  const [titleAssignment, setTitleAssignment] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['products', 'byIds', orderedIds.join(',')],
    queryFn: () => fetchJson<{ products: Product[] }>(`/api/products?ids=${orderedIds.join(',')}`),
    enabled: orderedIds.length > 0,
  });
  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson<{ user: { email: string } }>('/api/auth/me') });
  const { data: ratesData } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => fetchJson<{ rates: { currency: 'USD' | 'EUR'; ratePerTry: string }[] }>('/api/settings/exchange-rates'),
  });
  const missingRate =
    (currency === 'USD' || currency === 'EUR') && !ratesData?.rates.some((r) => r.currency === currency);

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
    setTitleAssignment((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function addExtraTitle() {
    setExtraTitles((prev) => [...prev, { id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: '' }]);
  }

  function updateExtraTitle(id: string, text: string) {
    setExtraTitles((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  function removeExtraTitle(id: string) {
    setExtraTitles((prev) => prev.filter((t) => t.id !== id));
    // Bu başlığa atanmış ürünler varsayılana (Katalog Adı) döner.
    setTitleAssignment((prev) => {
      const next = { ...prev };
      for (const productId of Object.keys(next)) {
        if (next[productId] === id) delete next[productId];
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const titleById = new Map(extraTitles.map((t) => [t.id, t.text.trim()]));
    const titleOverrides: Record<string, string> = {};
    for (const [productId, titleId] of Object.entries(titleAssignment)) {
      const text = titleById.get(titleId);
      if (text) titleOverrides[productId] = text;
    }
    try {
      const { catalog } = await fetchJson<{ catalog: { id: string } }>('/api/catalogs', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          currency: String(form.get('currency') ?? 'TRY') as CatalogCurrency,
          templateId,
          productIds: orderedIds,
          createdBy: meData?.user.email ?? 'bilinmiyor',
          ...(Object.keys(titleOverrides).length > 0 ? { titleOverrides } : {}),
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

            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-[14px]">Sayfa Başlıkları (opsiyonel)</span>
                <button type="button" className="btn-ghost text-[12px]" onClick={addExtraTitle}>
                  + Başlık Ekle
                </button>
              </div>
              {extraTitles.length === 0 && (
                <p className="text-[12px] text-[var(--color-bark)]">
                  Varsayılan olarak her sayfada üst künyede Katalog Adı gösterilir. Farklı ürün gruplarında farklı bir
                  başlık göstermek isterseniz buradan ekleyip sağdaki ürün listesinden hangi ürünlerde
                  kullanılacağını seçebilirsiniz.
                </p>
              )}
              {extraTitles.map((t, i) => (
                <div key={t.id} className="flex items-center gap-[9px]">
                  <input
                    value={t.text}
                    onChange={(e) => updateExtraTitle(t.id, e.target.value)}
                    placeholder={`Başlık ${i + 1} (örn. Modest NXT Swimwear)`}
                    className="flex-1 border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
                  />
                  <button type="button" onClick={() => removeExtraTitle(t.id)} aria-label="Başlığı kaldır" className="text-[14px] px-[5px]">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <label className="flex flex-col gap-[5px] text-[14px]">
              Para Birimi
              <select
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CatalogCurrency)}
                className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] outline-none"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD (Ayarlar'da kur girilmiş olmalı)</option>
                <option value="EUR">EUR (Ayarlar'da kur girilmiş olmalı)</option>
              </select>
            </label>

            {missingRate && (
              <p className="text-[14px] text-red-700">
                {currency} için kur tanımlı değil. Önce Ayarlar sayfasından kur girin.
              </p>
            )}

            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-[14px]">Şablon</span>
                <a href="/templates" target="_blank" rel="noreferrer" className="text-[12px] hover:underline text-[var(--color-bark)]">
                  → Tüm şablonları incele
                </a>
              </div>
              <div className="flex flex-col gap-[9px]">
                {CATALOG_TEMPLATES.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-[11px] border p-[11px] cursor-pointer ${
                      templateId === t.id ? 'border-[var(--color-ink-black)]' : 'border-[var(--color-pebble)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="templateId"
                      value={t.id}
                      checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)}
                      className="mt-[3px]"
                    />
                    <div className="flex flex-col gap-[2px]">
                      <span className="text-[14px] flex items-center gap-[7px]">
                        {t.name}
                        {t.isPlaceholder && (
                          <span className="text-[10px] uppercase tracking-wide text-[var(--color-bark)] border border-[var(--color-pebble)] rounded-full px-[7px] py-[1px]">
                            Geçici
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] text-[var(--color-bark)]">{t.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-[14px] text-red-700">{error}</p>}

            <button type="submit" className="btn-ghost justify-center" disabled={saving || orderedIds.length === 0 || missingRate}>
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
                  {extraTitles.length > 0 && (
                    <select
                      value={titleAssignment[id] ?? ''}
                      onChange={(e) =>
                        setTitleAssignment((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[id] = e.target.value;
                          else delete next[id];
                          return next;
                        })
                      }
                      className="text-[12px] border-b border-[var(--color-pebble)] bg-transparent py-[5px] outline-none max-w-[140px]"
                    >
                      <option value="">Varsayılan (Katalog Adı)</option>
                      {extraTitles.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.text || `Başlık ${extraTitles.indexOf(t) + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
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
