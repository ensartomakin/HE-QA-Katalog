import './editoryal.css';
import type { CatalogDetail, CatalogItem } from '@/lib/types';
import type { CatalogPrintTemplateProps } from '@/lib/catalog-print-templates';
import { upsizeTsoftImageUrl } from '@/lib/tsoft-image';

// Görseller object-fit:cover ile kutuya kırpılıyor (bkz. editoryal.css) — varsayılan odak
// noktası üstte tutuluyor ki manken fotoğraflarında kafa kırpılmasın. Kullanıcı önizlemede
// bu noktayı görsel bazında değiştirebilir (bkz. CatalogItem.imageFocalPoints).
const DEFAULT_FOCAL_POINT = { x: 0.5, y: 0.15 };

function focalPointStyle(item: CatalogItem, imageUrl: string): { objectPosition: string } {
  const focal = item.imageFocalPoints?.[imageUrl] ?? DEFAULT_FOCAL_POINT;
  return { objectPosition: `${focal.x * 100}% ${focal.y * 100}%` };
}

const CURRENCY_SYMBOL: Record<CatalogDetail['currency'], string> = {
  TRY: 'TL',
  USD: '$',
  EUR: '€',
};

function formatPrice(value: number, currency: CatalogDetail['currency']): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL[currency]}`;
}

// Gerçek ürün açıklamaları (T-Soft'tan) genelde kumaş/kesim bilgisiyle başlayıp bakım
// talimatı, beden/ölçü tablosu gibi katalog sayfasına uygun olmayan uzun bir kuyrukla
// devam ediyor (bkz. "Modal Bol Kesim Blazer" örneği). Bu fonksiyon metni cümle cümle
// baştan okur, bakım/ölçü ile ilgili bir cümleye rastlayınca durur — geriye yalnızca
// kumaş/kesimle ilgili baş kısmı kalır.
const DESCRIPTION_STOP_WORDS = [
  'yıka', 'kuruma', 'kurut', 'ütü', 'beden:', 'boy:', 'boyu:', 'kalıp bilgisi', 'ölçü', 'iade', 'değişim', 'garanti', 'stok',
];
const DESCRIPTION_MAX_CHARS = 320;

function extractFabricExcerpt(description: string | null): string | null {
  if (!description) return null;
  const sentences = description.split(/(?<=[.!?])\s+/);
  const picked: string[] = [];
  let length = 0;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (DESCRIPTION_STOP_WORDS.some((w) => lower.includes(w))) break;
    picked.push(sentence);
    length += sentence.length;
    if (length >= DESCRIPTION_MAX_CHARS) break;
  }
  const result = picked.join(' ').trim();
  return result || null;
}

function EdBrandMark({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  if (brandLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoUrl} alt="Marka logosu" className="ed-brand-logo" />;
  }
  return <span>HE-QA</span>;
}

function EdSizeLine({ sizes, lengthLabelText }: { sizes: string[]; lengthLabelText: string | null }) {
  if (sizes.length === 0 && !lengthLabelText) return null;
  return (
    <div className="ed-size-line">
      {sizes.length > 0 && (
        <span>
          <strong>Beden:</strong> {sizes.join(' ')}
        </span>
      )}
      {lengthLabelText && (
        <span>
          <strong>Boy:</strong> {lengthLabelText}
        </span>
      )}
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
  // Küçük görseller: ana ürünün DİĞER renk varyantları. Kaynak IDML taslağının (s.4-7)
  // çerçeve koordinatları incelendi: her sayfada tek bir foto galerisi var, TR/EN için
  // ayrı galeri yok — dolayısıyla tek dilli (Türkçe) tek galerili bu yapı kaynağa uygun.
  const variantThumbs = item.colorVariants.filter((c) => c.imageUrl && c.colorLabel !== item.product.colorLabel);
  const sizeLabels = item.product.sizes.map((s) => s.label);
  const descriptionExcerpt = extractFabricExcerpt(item.product.description);

  const totalImageCount = (heroImage ? 1 : 0) + variantThumbs.length;
  // Kaynak taslaktaki (s.21 "Denim Kimono") 3 varyantlı ürün örneği: her zaman 1 büyük
  // hero solda + kalan 2 görsel onun yanında alt alta iki kutu halinde — sabit bir kural.
  const useHeroPlusStack = Boolean(heroImage) && variantThumbs.length === 2;
  // Kaynak taslaktaki (s.10 "Parçalı Modal Sweat") 5 varyantlı ürün örneği: hero solda +
  // sonraki 2 varyant yan yana bir sütunda alt alta + kalan 2 varyant tekil büyük sütun
  // olarak sağda — sabit bir kural.
  const useFiveLayout = Boolean(heroImage) && variantThumbs.length === 4;
  // Kaynak taslaktaki (s.11 "Kalın Çizgili Sweat") 6 varyantlı ürün örneği: hero solda +
  // sonraki 2 varyant bir sütunda alt alta + bir sonraki 2 varyant başka bir sütunda alt
  // alta + son varyant tekil büyük sütun olarak sağda — sabit bir kural.
  const useSixLayout = Boolean(heroImage) && variantThumbs.length === 5;
  // Kaynak taslaktaki (s.19 "Bisiklet Yaka Tişört") 8 varyantlı ürün örneği: hero solda +
  // ortada 3 ayrı sütun (her biri 2 varyant alt alta) + son varyant tekil büyük sütun
  // olarak sağda — sabit bir kural.
  const useEightLayout = Boolean(heroImage) && variantThumbs.length === 7;
  // Kaynak taslaktaki çok sayıda örnek sayfa (s.4-26) incelendi: 2-6 toplam görselde
  // hepsi büyük ve eşit boyutlu tek sırada (bazen aynı rengin 2 farklı çekimi küçük bir
  // çift olarak gruplanıyor — bizim veri modelimizde renk başına tek fotoğraf olduğu
  // için bu çift-gruplama birebir taklit edilemiyor, o yüzden sadeleştirildi). 7+ toplam
  // görselde büyük hero + küçük görsel ızgarası kullanılıyor (s.4'teki 9 görsellik örnek).
  const useEqualRow =
    !useHeroPlusStack && !useFiveLayout && !useSixLayout && !useEightLayout && totalImageCount > 0 && totalImageCount <= 6;

  return (
    <div className="pdf-page ed-product-page">
      <div className="ed-page-frame">
        <div className="ed-page-header">
          <EdBrandMark brandLogoUrl={brandLogoUrl} />
        </div>

        <div className="ed-product-layout">
          {useEightLayout ? (
            <div className="ed-media-row ed-media-row--eight">
              <div className="ed-media-box">
                {heroImage && (
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                )}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(0, 2).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(2, 4).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(4, 6).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              {variantThumbs.slice(6, 7).map((v) => (
                <div key={v.colorLabel} className="ed-media-box">
                  <img
                    src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                    alt={v.colorLabel}
                    style={focalPointStyle(item, v.imageUrl as string)}
                  />
                </div>
              ))}
            </div>
          ) : useSixLayout ? (
            <div className="ed-media-row ed-media-row--six">
              <div className="ed-media-box">
                {heroImage && (
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                )}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(0, 2).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(2, 4).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              {variantThumbs.slice(4, 5).map((v) => (
                <div key={v.colorLabel} className="ed-media-box">
                  <img
                    src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                    alt={v.colorLabel}
                    style={focalPointStyle(item, v.imageUrl as string)}
                  />
                </div>
              ))}
            </div>
          ) : useFiveLayout ? (
            <div className="ed-media-row ed-media-row--five">
              <div className="ed-media-box">
                {heroImage && (
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                )}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.slice(0, 2).map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
              {variantThumbs.slice(2, 4).map((v) => (
                <div key={v.colorLabel} className="ed-media-box">
                  <img
                    src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                    alt={v.colorLabel}
                    style={focalPointStyle(item, v.imageUrl as string)}
                  />
                </div>
              ))}
            </div>
          ) : useHeroPlusStack ? (
            <div className="ed-media-row ed-media-row--hero-stack">
              <div className="ed-hero-wrap">
                {heroImage && (
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                )}
              </div>
              <div className="ed-stack-col">
                {variantThumbs.map((v) => (
                  <div key={v.colorLabel} className="ed-media-box">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : useEqualRow ? (
            <div className="ed-media-row ed-media-row--equal">
              {heroImage && (
                <div className="ed-media-box">
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                </div>
              )}
              {variantThumbs.map((v) => (
                <div key={v.colorLabel} className="ed-media-box">
                  <img
                    src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                    alt={v.colorLabel}
                    style={focalPointStyle(item, v.imageUrl as string)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="ed-media-row">
              <div className="ed-hero-wrap">
                {heroImage && (
                  <img
                    src={upsizeTsoftImageUrl(heroImage.url, 'B')}
                    alt={item.product.name}
                    style={focalPointStyle(item, heroImage.url)}
                  />
                )}
              </div>
              {/* Kaynak taslaktaki (s.15 "Etek Ucu Oval Sweatshirt") 7 varyantlı ürün
                  örneği: hero solda + kalan 6 görsel 3 sütun x 2 satır ızgara halinde. */}
              <div className={`ed-thumb-grid${variantThumbs.length === 6 ? ' ed-thumb-grid--three-col' : ''}`}>
                {variantThumbs.map((v) => (
                  <div key={v.colorLabel} className="ed-thumb-wrap">
                    <img
                      src={upsizeTsoftImageUrl(v.imageUrl as string, 'O')}
                      alt={v.colorLabel}
                      style={focalPointStyle(item, v.imageUrl as string)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ed-info-col">
            <div className="ed-rule" />
            <div className="ed-panel-name">{item.product.name}</div>
            {descriptionExcerpt && <p className="ed-panel-description">{descriptionExcerpt}</p>}
            <div className="ed-panel-meta">
              <EdSizeLine sizes={sizeLabels} lengthLabelText={item.product.lengthLabel} />
              {item.product.fabricInfo && (
                <div className="ed-fabric-line">
                  <strong>Kumaş:</strong> {item.product.fabricInfo}
                </div>
              )}
            </div>
          </div>
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
            <p className="ed-about-text">
              2014 yılında kurulan EKD TEKSTİL SAN. VE TİC. LTD ŞTİ, faaliyete geçtiği günden bu yana kaliteyi ilke
              edinmiş, doğal içerikli kumaşları ulaşılabilir fiyatlarla müşterilerine sunan çevreye saygılı bir
              markadır.
            </p>
          </div>

          <div className="ed-rule ed-rule-vertical" />

          <div className="ed-contact-col">
            <div className="ed-about-heading">İLETİŞİM</div>
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
