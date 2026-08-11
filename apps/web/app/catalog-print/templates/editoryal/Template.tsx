import './editoryal.css';
import type { CatalogDetail, CatalogItem } from '@/lib/types';
import type { CatalogPrintTemplateProps } from '@/lib/catalog-print-templates';
import { upsizeTsoftImageUrl } from '@/lib/tsoft-image';

const CURRENCY_SYMBOL: Record<CatalogDetail['currency'], string> = {
  TRY: 'TL',
  USD: '$',
  EUR: '€',
};

function formatPrice(value: number, currency: CatalogDetail['currency']): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL[currency]}`;
}

function EdBrandMark({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  if (brandLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoUrl} alt="Marka logosu" className="ed-brand-logo" />;
  }
  return <span>HE-QA</span>;
}

function EdProductPage({
  item,
  currency,
  discountPct,
  brandLogoUrl,
  pageNumber,
}: {
  item: CatalogItem;
  currency: CatalogDetail['currency'];
  discountPct: number;
  brandLogoUrl: string | null;
  pageNumber: number;
}) {
  const heroImage = item.product.images.find((i) => i.isPrimary) ?? item.product.images[0];
  // Küçük görseller: ana ürünün DİĞER renk varyantları (kaynak InDesign taslağındaki
  // s.4-7 gibi) — .ed-thumb-grid flex-wrap olduğu için sayfa düzeni varyant sayısına
  // göre otomatik değişir (çok varyant = çok satır, sıfır varyant = görsel alanı yok,
  // ana görsel tüm alanı kaplar; bkz. editoryal.css).
  const colorVariantThumbs = item.colorVariants.filter((c) => c.imageUrl && c.colorLabel !== item.product.colorLabel);

  return (
    <div className="pdf-page ed-product-page">
      <div className="ed-page-frame">
        <div className="ed-page-header">
          <EdBrandMark brandLogoUrl={brandLogoUrl} />
        </div>

        <div className="ed-product-layout">
          <div className="ed-media-col">
            <div className="ed-hero-wrap">
              {heroImage && <img src={upsizeTsoftImageUrl(heroImage.url, 'B')} alt={item.product.name} />}
            </div>
            {colorVariantThumbs.length > 0 && (
              <div className="ed-thumb-grid">
                {colorVariantThumbs.map((v) => (
                  <div key={v.colorLabel} className="ed-thumb-wrap">
                    <img src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')} alt={v.colorLabel} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ed-info-col">
            <div className="ed-name-block">
              <div className="ed-product-name">{item.product.name}</div>
              {item.product.nameEn && <div className="ed-product-name-en">{item.product.nameEn}</div>}
            </div>

            <div className="ed-rule" />

            {(item.product.description || item.product.descriptionEn) && (
              <div className="ed-description-block">
                {item.product.description && <p className="ed-description">{item.product.description}</p>}
                {item.product.descriptionEn && <p className="ed-description-en">{item.product.descriptionEn}</p>}
              </div>
            )}

            <div className="ed-meta-row">
              <div className="ed-meta-block">
                <div className="ed-label">Beden / Size</div>
                <div className="ed-size-list">
                  {item.product.sizes.length > 0 ? (
                    item.product.sizes.map((s) => (
                      <span key={s.id} className="ed-size-box">
                        {s.label}
                      </span>
                    ))
                  ) : (
                    <span className="ed-empty">—</span>
                  )}
                </div>
              </div>
              {item.product.lengthLabel && (
                <div className="ed-meta-block">
                  <div className="ed-label">Boy / Length</div>
                  <div className="ed-length-value">{item.product.lengthLabel}</div>
                </div>
              )}
              {item.product.fabricInfo && (
                <div className="ed-meta-block ed-meta-block-fabric">
                  <div className="ed-label">Kumaş / Fabric</div>
                  <div className="ed-fabric-value">{item.product.fabricInfo}</div>
                </div>
              )}
            </div>

            <div className="ed-bottom-row">
              <div className="ed-colors-block">
                <div className="ed-label">Renkler</div>
                <div className="ed-color-dots">
                  {item.product.colors.length > 0 ? (
                    item.product.colors.map((c) => (
                      <span key={c.id} className="ed-color-dot" style={{ background: c.hexPreview ?? '#d8d2c2' }} title={c.name} />
                    ))
                  ) : (
                    <span className="ed-empty">—</span>
                  )}
                </div>
              </div>

              <div className="ed-price-block">
                <div className="ed-price-original">{formatPrice(item.originalPriceDisplay, currency)}</div>
                <div className="ed-price-row">
                  <span className="ed-price-value">{formatPrice(item.priceDisplay, currency)}</span>
                  <span className="ed-price-discount">%{Math.round(discountPct)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ed-page-number">{String(pageNumber).padStart(2, '0')}</div>
      </div>
    </div>
  );
}

function EdAboutPage({ brandLogoUrl, pageNumber }: { brandLogoUrl: string | null; pageNumber: number }) {
  return (
    <div className="pdf-page ed-about-page">
      <div className="ed-page-frame">
        <div className="ed-page-header">
          <EdBrandMark brandLogoUrl={brandLogoUrl} />
        </div>

        <div className="ed-about-layout">
          <div className="ed-about-col">
            <div className="ed-about-heading">HAKKIMIZDA</div>
            <div className="ed-about-heading-en">ABOUT US</div>
            <p className="ed-about-text">
              2014 yılında kurulan EKD TEKSTİL SAN. VE TİC. LTD ŞTİ, faaliyete geçtiği günden bu yana kaliteyi ilke
              edinmiş, doğal içerikli kumaşları ulaşılabilir fiyatlarla müşterilerine sunan çevreye saygılı bir
              markadır.
            </p>
            <p className="ed-about-text-en">
              Founded in 2014, EKD TEKSTİL SAN. VE TİC. LTD ŞTİ is an environmentally friendly company that has
              adopted quality as a principle since the day it started its activities and offers fabrics with natural
              content to its customers at accessible prices.
            </p>
          </div>

          <div className="ed-rule ed-rule-vertical" />

          <div className="ed-contact-col">
            <div className="ed-about-heading">İLETİŞİM</div>
            <div className="ed-about-heading-en">CONTACT US</div>
            <div className="ed-contact-row">
              <div className="ed-label">Telefon</div>
              <div className="ed-contact-value">0264 502 29 33</div>
            </div>
            <div className="ed-contact-row">
              <div className="ed-label">Adres</div>
              <div className="ed-contact-value">Erenler Mah. 1201 Sk. No:5 B31 Meydan 54 AVM / Erenler/SAKARYA</div>
            </div>
            <div className="ed-contact-row">
              <div className="ed-label">Web</div>
              <div className="ed-contact-value">WWW.HE-QA.COM</div>
            </div>
          </div>
        </div>

        <div className="ed-page-number">{String(pageNumber).padStart(2, '0')}</div>
      </div>
    </div>
  );
}

export default function EditoryalTemplate({ catalog, settings }: CatalogPrintTemplateProps) {
  const totalPages = catalog.items.length + 2; // kapak + ürünler + hakkımızda/iletişim

  return (
    <div className="catalog-print editoryal">
      <div className={`pdf-page ed-cover-page${catalog.coverImageUrl ? ' has-cover-image' : ''}`}>
        {catalog.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={catalog.coverImageUrl} alt="" className="ed-cover-image" />
        )}
        <div className="ed-cover-content">
          <div className="ed-cover-brand">
            <EdBrandMark brandLogoUrl={settings.brandLogoUrl} />
          </div>
          <div className="ed-cover-title">{catalog.coverTitle || catalog.name}</div>
          {catalog.coverSubtitle && <div className="ed-cover-subtitle">{catalog.coverSubtitle}</div>}
        </div>
      </div>

      {catalog.items.map((item, index) => (
        <EdProductPage
          key={item.id}
          item={item}
          currency={catalog.currency}
          discountPct={catalog.discountPct}
          brandLogoUrl={settings.brandLogoUrl}
          pageNumber={index + 2}
        />
      ))}

      <EdAboutPage brandLogoUrl={settings.brandLogoUrl} pageNumber={totalPages} />
    </div>
  );
}
