import './zarif.css';
import type { CatalogDetail, CatalogItem } from '@/lib/types';
import type { CatalogPrintTemplateProps } from '@/lib/catalog-print-templates';

const CURRENCY_SYMBOL: Record<CatalogDetail['currency'], string> = {
  TRY: 'TL',
  USD: '$',
  EUR: '€',
};

const CARDS_PER_PAGE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatPrice(value: number, currency: CatalogDetail['currency']): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL[currency]}`;
}

function ZarifBrandMark({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  if (brandLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoUrl} alt="Marka logosu" className="zarif-brand-logo" />;
  }
  return <span>HE-QA</span>;
}

function ZarifProductCard({ item, currency }: { item: CatalogItem; currency: CatalogDetail['currency'] }) {
  const heroImage = item.product.images.find((i) => i.isPrimary) ?? item.product.images[0];
  const thumbnails = item.colorVariants.slice(0, 3);

  return (
    <div className="zarif-card">
      <div className="zarif-hero-wrap">{heroImage && <img src={heroImage.url} alt={item.product.name} />}</div>

      {thumbnails.length > 0 && (
        <div className="zarif-thumb-row">
          {thumbnails.map((v) => (
            <div key={v.colorLabel} className="zarif-thumb-wrap">
              {v.imageUrl && <img src={v.imageUrl} alt={v.colorLabel} />}
            </div>
          ))}
        </div>
      )}

      <div className="zarif-info-row">
        <div className="zarif-name-block">
          <div className="zarif-label">Ürün Adı</div>
          <div className="zarif-product-name">{item.product.name}</div>
        </div>
        <div className="zarif-price-block">
          <div className="zarif-label">Toptan Fiyat</div>
          <div className="zarif-price-pill">{formatPrice(item.priceDisplay, currency)}</div>
        </div>
      </div>

      <div className="zarif-info-row">
        <div className="zarif-size-block">
          <div className="zarif-label">Beden</div>
          <div className="zarif-size-list">
            {item.product.sizes.length > 0 ? (
              item.product.sizes.map((s) => (
                <span key={s.id} className="zarif-size-box">
                  {s.label}
                </span>
              ))
            ) : (
              <span className="zarif-empty">Girilmedi</span>
            )}
          </div>
        </div>
        <div className="zarif-fabric-block">
          <div className="zarif-label">Kumaş</div>
          <div className="zarif-fabric-text">{item.product.fabricInfo || '—'}</div>
        </div>
      </div>

      {item.product.colors.length > 0 && (
        <div className="zarif-colors-block">
          <div className="zarif-label">Renkler</div>
          <div className="zarif-color-dots">
            {item.product.colors.map((c) => (
              <span key={c.id} className="zarif-color-dot" style={{ background: c.hexPreview ?? '#e8e4d8' }} title={c.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ZarifTemplate({ catalog, settings }: CatalogPrintTemplateProps) {
  const pages = chunk(catalog.items, CARDS_PER_PAGE);

  return (
    <div className="catalog-print zarif">
      {/* Kapak sayfası */}
      <div className={`pdf-page zarif-cover-page${catalog.coverImageUrl ? ' has-cover-image' : ''}`}>
        {catalog.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={catalog.coverImageUrl} alt="" className="zarif-cover-image" />
        )}
        <div className="zarif-cover-content">
          <div className="zarif-cover-brand">
            <ZarifBrandMark brandLogoUrl={settings.brandLogoUrl} />
          </div>
          <div className="zarif-cover-title">{catalog.coverTitle || catalog.name}</div>
          {catalog.coverSubtitle && <div className="zarif-cover-subtitle">{catalog.coverSubtitle}</div>}
        </div>
      </div>

      {/* Ürün grid sayfaları — 2x2 */}
      {pages.map((pageItems, pageIndex) => (
        <div className="pdf-page zarif-grid-page" key={pageIndex}>
          <div className="zarif-page-brand">
            <ZarifBrandMark brandLogoUrl={settings.brandLogoUrl} />
          </div>

          <div className="zarif-product-grid">
            {pageItems.map((item) => (
              <ZarifProductCard key={item.id} item={item} currency={catalog.currency} />
            ))}
          </div>

          <div className="zarif-page-number">{String(pageIndex + 2).padStart(2, '0')}</div>
        </div>
      ))}
    </div>
  );
}
