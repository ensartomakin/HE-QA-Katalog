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

// Ürün açıklamaları genelde kumaş içeriğiyle başlıyor (örn. "%100 polyester içerikli...",
// "%80 poliamid ve %20 elastan karışımıyla üretilen..."). Kumaş paneli için bu, ayrı bir
// fabricInfo alanına güvenmek yerine açıklama içinden yüzde+malzeme kalıpları çıkarılıp
// kısa bir özet ("%100 polyester", "%80 poliamid ve %20 elastan") olarak gösteriliyor.
const FABRIC_COMPOSITION_ITEM = '%\\s*\\d+\\s*[a-zA-ZçÇğĞıİöÖşŞüÜ]+';
const FABRIC_COMPOSITION_RE = new RegExp(`${FABRIC_COMPOSITION_ITEM}(?:\\s*(?:,|ve)\\s*${FABRIC_COMPOSITION_ITEM})*`, 'i');

function extractFabricComposition(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(FABRIC_COMPOSITION_RE);
  if (!match) return null;
  return match[0].replace(/\s+/g, ' ').trim();
}

interface MediaItem {
  key: string;
  url: string;
  alt: string;
  size: 'B' | 'O';
}

// Kaynak taslakta bir ürünün sayfada gösterebileceği görsel sayısının pratik bir üst
// sınırı var (en yoğun örnek: hero + 7 varyant = 8, bkz. s.19 "Bisiklet Yaka Tişört").
// Bunu aşan ürünlerde (örn. 13 varyant) ilk 8 görsel bu sayfada, kalanlar aynı ürünün
// devam sayfasında (kendi görsel sayısına uygun düzenle) gösterilir.
const MAX_IMAGES_PER_PAGE = 8;

function buildMediaItems(item: CatalogItem): MediaItem[] {
  // Galerinin ilk sırası büyük (hero) görsel olarak gösterilir, kalanı küçük görsel —
  // colorVariants zaten ürünün kendi rengini de içerir (bkz. catalog.service.ts
  // getCatalogDetail) ve önizlemedeki sürükle-bırak ile kaydedilen variantOrder'a göre
  // sıralanmıştır. Bu sayede ana görsel de diğer renk varyantlarıyla birlikte, kullanıcının
  // belirlediği sırayla değiştirilebilir; sabit olarak "ürünün kendi rengi" değildir.
  // Editoryal şablonunda küçük/ızgara hücreleri bile baskıda gözle görülür büyüklükte
  // (he-qa-website'teki gerçek ikon boyutlu thumbnail'lerin aksine) — bu yüzden hepsi
  // en yüksek çözünürlük varyantıyla ('B', ~3072x4578) isteniyor, yalnızca hero değil.
  const gallery = item.colorVariants.filter((c) => c.imageUrl);
  if (gallery.length > 0) {
    return gallery.map((v, i) => ({
      key: v.colorLabel,
      url: v.imageUrl as string,
      alt: i === 0 ? item.product.name : v.colorLabel,
      size: 'B',
    }));
  }

  // colorVariants boşsa (ör. ürünün colorLabel'i yok, renk ailesi kurulamamış) — en azından
  // ürünün kendi görselini göster; bu durumda sıralama yapılamaz (tek görsel var).
  const heroImage = item.product.images.find((i) => i.isPrimary) ?? item.product.images[0];
  return heroImage ? [{ key: 'hero', url: heroImage.url, alt: item.product.name, size: 'B' }] : [];
}

function chunkMediaItems(items: MediaItem[]): MediaItem[][] {
  if (items.length === 0) return [[]];
  const chunks: MediaItem[][] = [];
  for (let i = 0; i < items.length; i += MAX_IMAGES_PER_PAGE) chunks.push(items.slice(i, i + MAX_IMAGES_PER_PAGE));
  return chunks;
}

function EdBrandMark({ brandLogoUrl, variant }: { brandLogoUrl: string | null; variant?: 'footer' }) {
  const className = variant === 'footer' ? 'ed-brand-logo ed-brand-logo--footer' : 'ed-brand-logo';
  if (brandLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandLogoUrl} alt="Marka logosu" className={className} />;
  }
  return <span>HE-QA</span>;
}

// Sayfanın sol üst köşesindeki sabit "HE-QA / <başlık>" ifadesi — kaynak taslaktaki
// (referans görsel) her iç sayfanın üstünde tekrar eden künye ile aynı. "HE-QA" ve
// kırmızı "/" ayracı sabit; ardından gelen metin kullanıcının kapak başlığı alanına
// girdiği değer (örn. "TESETTÜR MAYO"), girilmemişse katalog adına düşer.
function EdRunningHeader({ title }: { title: string }) {
  return (
    <div className="ed-running-header">
      <span className="ed-running-header-brand">HE-QA</span>
      <span className="ed-running-header-rule">/</span>
      <span className="ed-running-header-title">{title}</span>
    </div>
  );
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

function EdMediaImage({ item, media }: { item: CatalogItem; media: MediaItem }) {
  return <img src={upsizeTsoftImageUrl(media.url, media.size)} alt={media.alt} style={focalPointStyle(item, media.url)} />;
}

/** Sayfa başına en fazla MAX_IMAGES_PER_PAGE (8) görsel — bir sayfadaki gerçek görsel
 *  sayısına (chunk.length) göre kaynak taslaktan doğrulanmış sabit bir düzen seçilir. */
function EdMediaLayout({ item, chunk }: { item: CatalogItem; chunk: MediaItem[] }) {
  const hero = chunk[0];
  const rest = chunk.slice(1);
  const n = chunk.length;

  // Kaynak taslaktaki (s.10 "Parçalı Modal Sweat") 5 görsel örneği: hero + 2'li grup +
  // 2 tekil büyük görsel.
  if (n === 5) {
    return (
      <div className="ed-media-row ed-media-row--five">
        <div className="ed-media-box">{hero && <EdMediaImage item={item} media={hero} />}</div>
        <div className="ed-stack-col">
          {rest.slice(0, 2).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        {rest.slice(2, 4).map((m) => (
          <div key={m.key} className="ed-media-box">
            <EdMediaImage item={item} media={m} />
          </div>
        ))}
      </div>
    );
  }

  // Kaynak taslaktaki (s.11 "Kalın Çizgili Sweat") 6 görsel örneği: hero + 2'li grup +
  // 2'li grup + 1 tekil büyük görsel.
  if (n === 6) {
    return (
      <div className="ed-media-row ed-media-row--six">
        <div className="ed-media-box">{hero && <EdMediaImage item={item} media={hero} />}</div>
        <div className="ed-stack-col">
          {rest.slice(0, 2).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        <div className="ed-stack-col">
          {rest.slice(2, 4).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        {rest.slice(4, 5).map((m) => (
          <div key={m.key} className="ed-media-box">
            <EdMediaImage item={item} media={m} />
          </div>
        ))}
      </div>
    );
  }

  // Kaynak taslaktaki (s.15 "Etek Ucu Oval Sweatshirt") 7 görsel örneği: hero solda +
  // kalan 6 görsel 3 sütun x 2 satır ızgara halinde.
  if (n === 7) {
    return (
      <div className="ed-media-row">
        <div className="ed-hero-wrap">{hero && <EdMediaImage item={item} media={hero} />}</div>
        <div className="ed-thumb-grid ed-thumb-grid--three-col">
          {rest.map((m) => (
            <div key={m.key} className="ed-thumb-wrap">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Kaynak taslaktaki (s.19 "Bisiklet Yaka Tişört") 8 görsel örneği: hero + 3 ayrı 2'li
  // grup + 1 tekil büyük görsel. Sayfa başına görsel sayısının üst sınırı (bkz.
  // MAX_IMAGES_PER_PAGE) olduğu için chunk uzunluğu bu değeri hiç aşmaz.
  if (n === 8) {
    return (
      <div className="ed-media-row ed-media-row--eight">
        <div className="ed-media-box">{hero && <EdMediaImage item={item} media={hero} />}</div>
        <div className="ed-stack-col">
          {rest.slice(0, 2).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        <div className="ed-stack-col">
          {rest.slice(2, 4).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        <div className="ed-stack-col">
          {rest.slice(4, 6).map((m) => (
            <div key={m.key} className="ed-media-box">
              <EdMediaImage item={item} media={m} />
            </div>
          ))}
        </div>
        {rest.slice(6, 7).map((m) => (
          <div key={m.key} className="ed-media-box">
            <EdMediaImage item={item} media={m} />
          </div>
        ))}
      </div>
    );
  }

  // 1,2,3,4 görselde hepsi büyük ve eşit boyutlu tek sırada — 3 görsel de 4 görsel gibi
  // yan yana gösterilir (kullanıcı isteğiyle, kaynaktaki "hero + 2'li grup" örneğinden
  // vazgeçildi).
  return (
    <div className="ed-media-row ed-media-row--equal">
      {chunk.map((m) => (
        <div key={m.key} className="ed-media-box">
          <EdMediaImage item={item} media={m} />
        </div>
      ))}
    </div>
  );
}

function EdProductPage({
  item,
  mediaChunk,
  currency,
  discountPct,
  brandLogoUrl,
  headerTitle,
  pageNumber,
}: {
  item: CatalogItem;
  mediaChunk: MediaItem[];
  currency: CatalogDetail['currency'];
  discountPct: number;
  brandLogoUrl: string | null;
  headerTitle: string;
  pageNumber: number;
}) {
  const sizeLabels = item.product.sizes.map((s) => s.label);
  const descriptionExcerpt = extractFabricExcerpt(item.product.description);
  const fabricComposition = extractFabricComposition(item.product.description) ?? item.product.fabricInfo;

  return (
    <div className="pdf-page ed-product-page">
      <div className="ed-page-frame">
        <EdRunningHeader title={headerTitle} />
        <div className="ed-product-layout">
          <EdMediaLayout item={item} chunk={mediaChunk} />

          <div className="ed-info-col">
            <div className="ed-rule" />
            <div className="ed-info-row">
              <div className="ed-info-left">
                <div className="ed-panel-name">{item.product.name}</div>
                {descriptionExcerpt && <p className="ed-panel-description">{descriptionExcerpt}</p>}
              </div>
              <div className="ed-info-right">
                <EdSizeLine sizes={sizeLabels} lengthLabelText={item.product.lengthLabel} />
                {fabricComposition && (
                  <div className="ed-fabric-line">
                    <strong>Kumaş:</strong> {fabricComposition}
                  </div>
                )}
                <div className="ed-price-block">
                  <div className="ed-price-label">Toptan Fiyat</div>
                  <div className="ed-price-row">
                    <span className="ed-price-original">{formatPrice(item.originalPriceDisplay, currency)}</span>
                    <span className="ed-price-value">{formatPrice(item.priceDisplay, currency)}</span>
                    <span className="ed-price-discount">%{Math.round(discountPct)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ed-page-footer">
          <div className="ed-footer-brand">
            <EdBrandMark brandLogoUrl={brandLogoUrl} variant="footer" />
          </div>
          <div className="ed-page-number">{String(pageNumber).padStart(2, '0')}</div>
        </div>
      </div>
    </div>
  );
}

function EdAboutPage({
  brandLogoUrl,
  headerTitle,
  pageNumber,
}: {
  brandLogoUrl: string | null;
  headerTitle: string;
  pageNumber: number;
}) {
  return (
    <div className="pdf-page ed-about-page">
      <div className="ed-page-frame">
        <EdRunningHeader title={headerTitle} />
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

        <div className="ed-page-footer">
          <div className="ed-footer-brand">
            <EdBrandMark brandLogoUrl={brandLogoUrl} variant="footer" />
          </div>
          <div className="ed-page-number">{String(pageNumber).padStart(2, '0')}</div>
        </div>
      </div>
    </div>
  );
}

export default function EditoryalTemplate({ catalog, settings }: CatalogPrintTemplateProps) {
  // Bir ürünün görsel sayısı sayfa başına düşen üst sınırı (8) aşarsa birden fazla sayfaya
  // bölünür (bkz. MAX_IMAGES_PER_PAGE) — bu yüzden sayfa sayısı artık catalog.items.length
  // ile birebir değil, toplam üretilen "ürün sayfası" sayısıyla belirleniyor.
  const productPages = catalog.items.flatMap((item) =>
    chunkMediaItems(buildMediaItems(item)).map((chunk, chunkIndex) => ({
      key: `${item.id}-${chunkIndex}`,
      item,
      chunk,
    }))
  );
  const totalPages = productPages.length + 2; // kapak + ürün sayfaları + hakkımızda/iletişim
  const headerTitle = catalog.coverTitle || catalog.name;

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

      {productPages.map((pp, index) => (
        <EdProductPage
          key={pp.key}
          item={pp.item}
          mediaChunk={pp.chunk}
          currency={catalog.currency}
          discountPct={catalog.discountPct}
          brandLogoUrl={settings.brandLogoUrl}
          headerTitle={headerTitle}
          pageNumber={index + 2}
        />
      ))}

      <EdAboutPage brandLogoUrl={settings.brandLogoUrl} headerTitle={headerTitle} pageNumber={totalPages} />
    </div>
  );
}
