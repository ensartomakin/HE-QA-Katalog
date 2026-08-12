import './heqa-website.css';
import type { CatalogDetail, CatalogItem } from '@/lib/types';
import type { CatalogPrintTemplateProps } from '@/lib/catalog-print-templates';
import { upsizeTsoftImageUrl } from '@/lib/tsoft-image';

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
  // Sayı ile para birimi arasında ince boşluk (U+2009) — normal boşluktan daha
  // sıkı, tipografik olarak standart bir ayraç.
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL[currency]}`;
}

function HeqaBrandMark({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  if (brandLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoUrl} alt="Marka logosu" className="heqa-brand-logo" />;
  }
  return <span>HE-QA</span>;
}

function HeqaProductCard({
  item,
  currency,
  discountPct,
}: {
  item: CatalogItem;
  currency: CatalogDetail['currency'];
  discountPct: number;
}) {
  // Galerinin ilk sırası büyük (hero) görsel, kalanı küçük görsel — colorVariants ürünün
  // kendi rengini de içerir ve önizlemedeki sürükle-bırak ile kaydedilen variantOrder'a göre
  // sıralanmıştır (bkz. editoryal Template.tsx buildMediaItems, aynı mantık). Bu sayede ana
  // görsel de diğer renk varyantlarıyla birlikte kullanıcının belirlediği sırayla değişir.
  const gallery = item.colorVariants.filter((c) => c.imageUrl);
  const fallbackHeroImage = item.product.images.find((i) => i.isPrimary) ?? item.product.images[0];
  const heroImage = gallery.length > 0 ? { url: gallery[0].imageUrl as string } : fallbackHeroImage;
  const thumbnails = gallery.length > 0 ? gallery.slice(1, 4) : [];

  return (
    <div className="heqa-card">
      <div className="heqa-media-row">
        <div className="heqa-hero-wrap">
          {heroImage && <img src={upsizeTsoftImageUrl(heroImage.url, 'B')} alt={item.product.name} />}
        </div>
        <div className="heqa-thumb-col">
          {thumbnails.map((t) => (
            <div key={t.colorLabel} className="heqa-thumb-wrap">
              <img src={upsizeTsoftImageUrl(t.imageUrl as string, 'O')} alt={t.colorLabel} />
            </div>
          ))}
        </div>
      </div>

      <div className="heqa-row heqa-row-name-price">
        <div className="heqa-name-block">
          <div className="heqa-label">Ürün Adı</div>
          <div className="heqa-product-name">{item.product.name}</div>
        </div>
        <div className="heqa-price-block">
          <div className="heqa-label">Toptan Fiyat</div>
          <div className="heqa-price-original">{formatPrice(item.originalPriceDisplay, currency)}</div>
          <div className="heqa-price-row">
            <span className="heqa-price-pill">{formatPrice(item.priceDisplay, currency)}</span>
            <span className="heqa-price-discount">%{Math.round(discountPct)}</span>
          </div>
        </div>
      </div>

      <div className="heqa-row heqa-row-colors">
        <div className="heqa-colors-block">
          <div className="heqa-label">Renkler</div>
          <div className="heqa-color-dots">
            {item.product.colors.length > 0 ? (
              item.product.colors.map((c) => (
                <span key={c.id} className="heqa-color-dot" style={{ background: c.hexPreview ?? '#d8d2c2' }} title={c.name} />
              ))
            ) : (
              <span className="heqa-empty">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="heqa-row heqa-row-meta">
        <div className="heqa-size-block">
          <div className="heqa-label">Beden</div>
          <div className="heqa-size-list">
            {item.product.sizes.length > 0 ? (
              item.product.sizes.map((s) => (
                <span key={s.id} className="heqa-size-box">
                  {s.label}
                </span>
              ))
            ) : (
              <span className="heqa-empty">—</span>
            )}
          </div>
        </div>
        <div className="heqa-fabric-block">
          <div className="heqa-label">Kumaş</div>
          <div className="heqa-fabric-text">{item.product.fabricInfo || '—'}</div>
        </div>
      </div>
    </div>
  );
}

export default function HeqaWebsiteTemplate({ catalog, settings }: CatalogPrintTemplateProps) {
  const pages = chunk(catalog.items, CARDS_PER_PAGE);

  return (
    <div className="catalog-print heqa">
      {/* Kapak sayfası */}
      <div className={`pdf-page heqa-cover-page${catalog.coverImageUrl ? ' has-cover-image' : ''}`}>
        {catalog.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={catalog.coverImageUrl} alt="" className="heqa-cover-image" />
        )}
        <div className="heqa-cover-content">
          <div className="heqa-cover-brand">
            <HeqaBrandMark brandLogoUrl={settings.brandLogoUrl} />
          </div>
          <div className="heqa-cover-title">{catalog.coverTitle || catalog.name}</div>
          {catalog.coverSubtitle && <div className="heqa-cover-subtitle">{catalog.coverSubtitle}</div>}
        </div>
      </div>

      {/* Ürün grid sayfaları — 2x2 */}
      {pages.map((pageItems, pageIndex) => (
        <div className="pdf-page heqa-grid-page" key={pageIndex}>
          <div className="heqa-page-frame">
            <div className="heqa-page-brand">
              <HeqaBrandMark brandLogoUrl={settings.brandLogoUrl} />
            </div>

            <div className="heqa-product-grid">
              {pageItems.map((item) => (
                <HeqaProductCard key={item.id} item={item} currency={catalog.currency} discountPct={catalog.discountPct} />
              ))}
            </div>

            <div className="heqa-page-number">{String(pageIndex + 2).padStart(2, '0')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
