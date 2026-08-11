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

function EdSizeLine({ label, sizes, lengthLabel, lengthLabelText }: { label: string; sizes: string[]; lengthLabel: string; lengthLabelText: string | null }) {
  if (sizes.length === 0 && !lengthLabelText) return null;
  return (
    <div className="ed-size-line">
      {sizes.length > 0 && (
        <span>
          <strong>{label}:</strong> {sizes.join(' ')}
        </span>
      )}
      {lengthLabelText && (
        <span>
          <strong>{lengthLabel}:</strong> {lengthLabelText}
        </span>
      )}
    </div>
  );
}

function EdLangPanel({
  heroImage,
  variantThumbs,
  productName,
  altName,
  description,
  fabricLabel,
  fabricInfo,
  sizeLabel,
  sizes,
  lengthLabel,
  lengthLabelText,
}: {
  heroImage: { url: string } | undefined;
  variantThumbs: { colorLabel: string; imageUrl: string | null }[];
  productName: string;
  altName: string;
  description: string | null;
  fabricLabel: string;
  fabricInfo: string | null;
  sizeLabel: string;
  sizes: string[];
  lengthLabel: string;
  lengthLabelText: string | null;
}) {
  return (
    <div className="ed-lang-panel">
      <div className="ed-media-row">
        <div className="ed-hero-wrap">{heroImage && <img src={upsizeTsoftImageUrl(heroImage.url, 'B')} alt={altName} />}</div>
        {variantThumbs.length > 0 && (
          <div className="ed-thumb-grid">
            {variantThumbs.map((v) => (
              <div key={v.colorLabel} className="ed-thumb-wrap">
                <img src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')} alt={v.colorLabel} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ed-rule" />
      <div className="ed-panel-name">{productName}</div>
      {description && <p className="ed-panel-description">{description}</p>}
      <div className="ed-panel-meta">
        <EdSizeLine label={sizeLabel} sizes={sizes} lengthLabel={lengthLabel} lengthLabelText={lengthLabelText} />
        {fabricInfo && (
          <div className="ed-fabric-line">
            <strong>{fabricLabel}:</strong> {fabricInfo}
          </div>
        )}
      </div>
    </div>
  );
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
  // Küçük görseller: ana ürünün DİĞER renk varyantları — kaynak InDesign taslağındaki
  // s.4-7'de TR ve EN panelleri AYNI foto setini kullanıyor (T-Soft'tan renk varyantı
  // başına yalnızca 1 görsel geliyor — taslaktaki gibi dile özel çekim seti yok, bu
  // yüzden iki panel de aynı hero+varyant görsellerini paylaşıyor).
  const variantThumbs = item.colorVariants.filter((c) => c.imageUrl && c.colorLabel !== item.product.colorLabel);
  const sizeLabels = item.product.sizes.map((s) => s.label);

  return (
    <div className="pdf-page ed-product-page">
      <div className="ed-page-frame">
        <div className="ed-page-header">
          <EdBrandMark brandLogoUrl={brandLogoUrl} />
        </div>

        <div className="ed-product-layout">
          <EdLangPanel
            heroImage={heroImage}
            variantThumbs={variantThumbs}
            productName={item.product.name}
            altName={item.product.name}
            description={item.product.description}
            fabricLabel="Kumaş"
            fabricInfo={item.product.fabricInfo}
            sizeLabel="Beden"
            sizes={sizeLabels}
            lengthLabel="Boy"
            lengthLabelText={item.product.lengthLabel}
          />
          <EdLangPanel
            heroImage={heroImage}
            variantThumbs={variantThumbs}
            productName={item.product.nameEn || item.product.name}
            altName={item.product.nameEn || item.product.name}
            description={item.product.descriptionEn}
            fabricLabel="Fabric"
            fabricInfo={item.product.fabricInfo}
            sizeLabel="Size"
            sizes={sizeLabels}
            lengthLabel="Lenght"
            lengthLabelText={item.product.lengthLabel}
          />
        </div>

        <div className="ed-page-footer">
          <div className="ed-price-line">
            <span className="ed-price-original">{formatPrice(item.originalPriceDisplay, currency)}</span>
            <span className="ed-price-value">{formatPrice(item.priceDisplay, currency)}</span>
            <span className="ed-price-discount">%{Math.round(discountPct)}</span>
          </div>
          <div className="ed-page-number">{String(pageNumber).padStart(2, '0')}</div>
        </div>
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
