'use client';

import { calculatePrice } from '@he-qa/db';
import type { Product } from '@/lib/types';
import { useCatalogSelection } from '@/lib/catalog-selection.store';

const STOCK_LABEL: Record<Product['stockStatus'], string> = {
  IN_STOCK: 'Stokta',
  LOW_STOCK: 'Az Stok',
  OUT_OF_STOCK: 'Stok Yok',
  UNKNOWN: 'Bilinmiyor',
};

export function ProductCard({ product, discountPct }: { product: Product; discountPct: number }) {
  const { isSelected, toggle } = useCatalogSelection();
  const selected = isSelected(product.id);
  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];

  const { wholesaleTry } = calculatePrice({
    sourcePriceTry: Number(product.sourcePriceTry),
    discountPct,
    ratePerTry: 1,
  });

  return (
    <div className="flex flex-col gap-[9px]">
      <button
        type="button"
        onClick={() => toggle(product.id)}
        className="relative aspect-[3/4] bg-[var(--color-linen)] overflow-hidden text-left"
      >
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primaryImage.url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-bark)] text-[14px]">Görsel yok</div>
        )}
        <span
          className="absolute top-[9px] right-[9px] w-[20px] h-[20px] border border-[var(--color-ink-black)] flex items-center justify-center bg-[var(--color-bone-white)]"
          aria-hidden
        >
          {selected ? '✓' : ''}
        </span>
      </button>

      <div className="text-[14px] text-[var(--color-bark)]">{STOCK_LABEL[product.stockStatus]}</div>
      <div className="text-[21px] leading-[1.2]">{product.name}</div>
      <div className="text-[14px] text-[var(--color-bark)]">{product.code}</div>

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

      {product.sizes.length > 0 ? (
        <div className="flex flex-wrap gap-[5px] text-[14px] text-[var(--color-bark)]">
          {product.sizes.map((s) => (
            <span key={s.id} className="px-[9px] py-[2px] border border-[var(--color-pebble)] rounded-[20px]">
              {s.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[14px] text-[var(--color-bark)] italic">Beden bilgisi girilmedi</div>
      )}

      {product.fabricInfo && <div className="text-[14px] text-[var(--color-bark)]">{product.fabricInfo}</div>}

      <div className="text-[21px] font-medium">{wholesaleTry.toFixed(2)} TL</div>
    </div>
  );
}
