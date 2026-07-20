import '../print.css';
import { workerFetch } from '@/lib/worker-client';
import type { CatalogDetail, CatalogItem } from '@/lib/types';

const CURRENCY_SYMBOL: Record<CatalogDetail['currency'], string> = {
  TRY: 'TL',
  USD: '$',
  EUR: '€',
};

const CARDS_PER_PAGE = 6;

export const dynamic = 'force-dynamic';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ProductCardPrint({ item, currency }: { item: CatalogItem; currency: CatalogDetail['currency'] }) {
  const primaryImage = item.product.images.find((i) => i.isPrimary) ?? item.product.images[0];
  const symbol = CURRENCY_SYMBOL[currency];

  return (
    <div className="product-card">
      <div className="product-image-wrap">
        {primaryImage && <img src={primaryImage.url} alt={item.product.name} />}
      </div>
      <div className="product-name">{item.product.name}</div>
      <div className="product-code">{item.product.code}</div>

      {item.product.colors.length > 0 && (
        <div className="product-colors">
          {item.product.colors.map((c) => (
            <span key={c.id} className="product-color-dot" style={{ background: c.hexPreview ?? '#e8e4d8' }} title={c.name} />
          ))}
        </div>
      )}

      <div className="product-sizes">
        {item.product.sizes.length > 0 ? item.product.sizes.map((s) => s.label).join(' / ') : 'Beden bilgisi girilmedi'}
      </div>

      {item.product.fabricInfo && <div className="product-fabric">{item.product.fabricInfo}</div>}

      <div className="product-price-row">
        <span className="product-price">
          {item.priceDisplay.toFixed(2)} {symbol}
        </span>
        <span className="product-price-badge">%40 İNDİRİMLİ</span>
      </div>
    </div>
  );
}

export default async function CatalogPrintPage({ params }: { params: { id: string } }) {
  const { catalog } = await workerFetch<{ catalog: CatalogDetail | null }>(`/api/catalogs/${params.id}`);

  if (!catalog) {
    return (
      <div className="catalog-print">
        <div className="pdf-page cover-page">
          <p>Katalog bulunamadı.</p>
        </div>
      </div>
    );
  }

  const pages = chunk(catalog.items, CARDS_PER_PAGE);
  const now = new Date(catalog.createdAt);

  return (
    <div className="catalog-print">
      {/* Kapak sayfası */}
      <div className="pdf-page cover-page">
        <div>
          <div className="cover-brand">HE-QA</div>
          <div className="cover-brand-sub">Simple. Modern. You.</div>

          <div className="cover-title">{catalog.coverTitle || catalog.name}</div>
          {catalog.coverSubtitle && <div className="cover-subtitle">{catalog.coverSubtitle}</div>}

          <div className="trust-band">
            <div className="trust-item">
              <strong>%40 Toptan İndirim</strong>
              Tüm ürünlerde geçerli sabit toptan indirim oranı.
            </div>
            <div className="trust-item">
              <strong>Güncel Ürünler</strong>
              Fiyat ve stok bilgileri kataloğun üretildiği tarih itibarıyla günceldir.
            </div>
            <div className="trust-item">
              <strong>{catalog.items.length} Ürün</strong>
              Bu katalogda yer alan toplam ürün sayısı.
            </div>
          </div>
        </div>

        <div className="cover-meta">
          <span>HE-QA Toptan Katalog</span>
          <span>{now.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Ürün grid sayfaları — 3x2, docs §4 */}
      {pages.map((pageItems, pageIndex) => (
        <div className="pdf-page grid-page" key={pageIndex}>
          <div className="grid-page-header">
            <span className="catalog-name">{catalog.name}</span>
            <span className="page-badge">{pageIndex + 2}. SAYFA</span>
          </div>
          <div className="product-grid">
            {pageItems.map((item) => (
              <ProductCardPrint key={item.id} item={item} currency={catalog.currency} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
