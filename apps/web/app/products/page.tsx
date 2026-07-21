'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import { ProductCard } from '@/components/ProductCard';
import { CategoryTreePicker } from '@/components/CategoryTreePicker';
import { useCatalogSelection } from '@/lib/catalog-selection.store';
import type { Category, Product } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [sort, setSort] = useState<'performance' | 'manual' | 'newest'>('newest');
  const [syncingCategoryId, setSyncingCategoryId] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const selection = useCatalogSelection();
  const queryClient = useQueryClient();

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => fetchJson('/api/products/sort-order', { method: 'PUT', body: JSON.stringify({ ids }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchJson<{ categories: Category[] }>('/api/categories'),
  });
  const categories = categoriesData?.categories ?? [];

  const syncCategoriesMutation = useMutation({
    mutationFn: () => fetchJson('/api/sync/categories', { method: 'POST' }),
    onSuccess: () => refetchCategories(),
  });

  // Bir kategori seçildiğinde: önce o kategorinin ürünlerini tsoft'tan anlık çekip
  // önbelleğe yazar (syncCategoryProducts), sonra ürün listesi sorgusu bunu okur.
  // "Tüm kataloğu çekip sistemi şişirme, hangi kategoriyi seçtiysem onu getir" isteği.
  async function selectCategory(id: string, tsoftCategoryId: string) {
    const already = selectedCategoryIds.includes(id);
    setSelectedCategoryIds((prev) => (already ? prev.filter((c) => c !== id) : [...prev, id]));
    if (already) return;

    setSyncingCategoryId(id);
    try {
      await fetchJson(`/api/sync/category/${tsoftCategoryId}`, { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } finally {
      setSyncingCategoryId(null);
    }
  }

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    params.set('sort', sort);
    return params.toString();
  }, [search, selectedCategoryIds, sort]);

  const hasFilter = search.length > 0 || selectedCategoryIds.length > 0;

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', qs],
    queryFn: () => fetchJson<{ products: Product[] }>(`/api/products?${qs}`),
    enabled: hasFilter,
  });

  const products = productsData?.products ?? [];
  const discountPct = 40; // Settings.wholesaleDiscountPct — sabit kural (bkz. docs §2)

  // Manuel sekmede yerel sıra state'i tutulur ki sürükle-bırak sırasında her adımda
  // sunucuyu beklemeden anında görsel geri bildirim verilsin; sunucudan yeni veri gelince
  // (kategori/arama değişince) senkronize edilir.
  useEffect(() => {
    if (sort === 'manual') setManualOrder(products.map((p) => p.id));
  }, [sort, productsData]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const displayedProducts =
    sort === 'manual' ? manualOrder.map((id) => productById.get(id)).filter((p): p is Product => Boolean(p)) : products;

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setManualOrder((prev) => {
      const next = prev.filter((id) => id !== dragId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, dragId);
      saveOrder.mutate(next);
      return next;
    });
    setDragId(null);
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />

      <div className="px-[17px] flex flex-col gap-[25px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Ürün Seçim Paneli</h1>
          <div className="flex items-center gap-[17px]">
            <span className="text-[14px] text-[var(--color-bark)]">{selection.selectedIds.size} ürün seçildi</span>
            {selection.selectedIds.size > 0 && (
              <Link href="/catalogs/new" className="btn-ghost">
                → Katalog Oluştur
              </Link>
            )}
          </div>
        </div>

        <input
          type="search"
          placeholder="Ürün adı veya kod ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-b border-[var(--color-pebble)] bg-transparent px-[17px] py-[11px] text-[14px] outline-none"
        />

        {categories.length === 0 ? (
          <div className="flex items-center gap-[17px]">
            <p className="text-[14px] text-[var(--color-bark)]">Kategori ağacı henüz senkronize edilmedi.</p>
            <button type="button" className="btn-ghost" onClick={() => syncCategoriesMutation.mutate()} disabled={syncCategoriesMutation.isPending}>
              {syncCategoriesMutation.isPending ? 'Senkronize ediliyor…' : '→ Kategorileri Senkronize Et'}
            </button>
          </div>
        ) : (
          <CategoryTreePicker
            categories={categories}
            selectedIds={selectedCategoryIds}
            onChange={(ids) => {
              // Yeni eklenen kategori(ler) için anlık ürün senkronu tetiklenir.
              const added = ids.filter((id) => !selectedCategoryIds.includes(id));
              setSelectedCategoryIds(ids);
              for (const id of added) {
                const cat = categoryById.get(id);
                if (!cat) continue;
                setSyncingCategoryId(id);
                fetchJson(`/api/sync/category/${cat.tsoftCategoryId}`, { method: 'POST' })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['products'] }))
                  .finally(() => setSyncingCategoryId(null));
              }
            }}
          />
        )}

        {syncingCategoryId && (
          <p className="text-[14px] text-[var(--color-bark)]">Seçilen kategorinin ürünleri tsoft'tan çekiliyor…</p>
        )}

        {hasFilter && (
          <div className="flex items-center gap-[11px] text-[14px]">
            <span className="text-[var(--color-bark)]">Sırala:</span>
            {(['newest', 'performance', 'manual'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSort(opt)}
                className="underline-offset-4"
                style={{ textDecoration: sort === opt ? 'underline' : 'none', fontWeight: sort === opt ? 500 : 400 }}
              >
                {opt === 'newest' ? 'En Yeni' : opt === 'performance' ? 'Performans' : 'Manuel'}
              </button>
            ))}
          </div>
        )}

        {!hasFilter && (
          <p className="text-[14px] text-[var(--color-bark)]">
            Ürünleri görmek için yukarıdan bir kategori seçin ya da arama yapın.
          </p>
        )}

        {isLoading && <p className="text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>}

        {sort === 'manual' && hasFilter && (
          <p className="text-[14px] text-[var(--color-bark)]">Sırayı değiştirmek için ürün kartlarını sürükleyip bırakın.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-[25px]">
          {displayedProducts.map((p) => (
            <div
              key={p.id}
              draggable={sort === 'manual'}
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => sort === 'manual' && e.preventDefault()}
              onDrop={() => handleDrop(p.id)}
              onDragEnd={() => setDragId(null)}
              style={{ opacity: dragId === p.id ? 0.4 : 1, cursor: sort === 'manual' ? 'grab' : undefined }}
            >
              <ProductCard product={p} discountPct={discountPct} />
            </div>
          ))}
        </div>

        {hasFilter && !isLoading && products.length === 0 && (
          <p className="text-[14px] text-[var(--color-bark)]">Bu filtrede ürün bulunamadı.</p>
        )}
      </div>
    </main>
  );
}
