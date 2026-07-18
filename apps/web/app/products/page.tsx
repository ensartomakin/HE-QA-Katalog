'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';
import { ProductCard } from '@/components/ProductCard';
import { useCatalogSelection } from '@/lib/catalog-selection.store';
import type { Category, Product } from '@/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [sort, setSort] = useState<'performance' | 'manual' | 'newest'>('newest');
  const selection = useCatalogSelection();

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchJson<{ categories: Category[] }>('/api/categories'),
  });

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    params.set('sort', sort);
    return params.toString();
  }, [search, selectedCategoryIds, sort]);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', qs],
    queryFn: () => fetchJson<{ products: Product[] }>(`/api/products?${qs}`),
  });

  const categories = categoriesData?.categories ?? [];
  const products = productsData?.products ?? [];
  const discountPct = 40; // Settings.wholesaleDiscountPct — sabit kural (bkz. docs §2)

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />

      <div className="px-[17px] flex flex-col gap-[25px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Ürün Seçim Paneli</h1>
          <span className="text-[14px] text-[var(--color-bark)]">{selection.selectedIds.size} ürün seçildi</span>
        </div>

        <input
          type="search"
          placeholder="Ürün adı veya kod ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-b border-[var(--color-pebble)] bg-transparent px-[17px] py-[11px] text-[14px] outline-none"
        />

        <div className="flex flex-wrap gap-[9px]">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              className="text-[14px] px-[15px] py-[9px] rounded-[20px] border"
              style={{
                borderColor: 'var(--color-ink-black)',
                background: selectedCategoryIds.includes(c.id) ? 'var(--color-ink-black)' : 'transparent',
                color: selectedCategoryIds.includes(c.id) ? 'var(--color-bone-white)' : 'var(--color-ink-black)',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

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

        {isLoading && <p className="text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-[25px]">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} discountPct={discountPct} />
          ))}
        </div>

        {!isLoading && products.length === 0 && (
          <p className="text-[14px] text-[var(--color-bark)]">
            Ürün bulunamadı. Önce Senkronizasyon sekmesinden "Şimdi Senkronize Et" ile tsoft'tan veri çekin.
          </p>
        )}
      </div>
    </main>
  );
}
