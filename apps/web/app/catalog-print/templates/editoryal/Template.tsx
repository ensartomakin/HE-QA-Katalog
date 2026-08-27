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

// Gerçek ürün açıklamaları (T-Soft'tan) genelde kumaş/kesim/amaç bilgisini tek bir açılış
// cümlesinde verip bakım talimatı, beden/ölçü tablosu gibi katalog sayfasına uygun olmayan
// uzun bir kuyrukla devam ediyor (bkz. "Spor Görünümlü Tesettür Mayo Takımı" örneği:
// "%80 poliamid ve %20 elastan karışımıyla üretilen bu tesettür mayo, deniz ve havuz
// kullanımında maksimum konfor sunmak için özel olarak tasarlanmıştır."). Bu liste, o
// açılış cümlesi yerine yanlışlıkla bir bakım/ölçü cümlesi seçilmesini önlemek için var.
const DESCRIPTION_STOP_WORDS = [
  'yıka', 'kuruma', 'kurut', 'ütü', 'beden:', 'boy:', 'boyu:', 'kalıp bilgisi', 'ölçü', 'iade', 'değişim', 'garanti', 'stok',
];

// T-Soft'taki ürün adları genelde model adı + rengin/desenin adıyla bitiyor (örn.
// "RÜZGARLIK DETAYLI UZUN YÜZME TAKIMI AÇIK HAKİ" → model + "Açık Haki" rengi).
// Sayfada sadece modele ait kısmın kalması için, ürünün kendi colorLabel'i adın
// sonunda geçiyorsa (büyük/küçük harf farkı gözetmeden) kırpılıyor.
function stripColorFromName(name: string, colorLabel: string | null): string {
  const trimmedColor = colorLabel?.trim();
  if (!trimmedColor) return name;
  const lowerName = name.toLocaleLowerCase('tr');
  const lowerColor = trimmedColor.toLocaleLowerCase('tr');
  if (!lowerName.endsWith(lowerColor)) return name;
  return name.slice(0, name.length - trimmedColor.length).trim();
}

// hexPreview boş bırakılan renk varyantları için son çare — rengin adı gerçek bir
// renk sözlüğünde bulunuyorsa (örn. "İndigo", "Karamel") onun tonunu kullan; "açık/koyu"
// gibi tonlama önekleri bulunamazsa sıyrılıp tekrar denenir. Sözlükte hiçbir eşleşme
// yoksa (örn. "Çiçekli Desen", "Leopar" gibi bir baskı/desen adıysa) null döner — bu
// durumda çağıran taraf gerçekten "tanımlanamayan" bir varyant olduğunu bilir.
const COLOR_NAME_HEX: Record<string, string> = {
  siyah: '#1a1a1a',
  beyaz: '#f5f4ef',
  gri: '#8a8a86',
  antrasit: '#3a3a3a',
  füme: '#5c5c5c',
  lacivert: '#1b2a4a',
  mavi: '#3a6ea5',
  indigo: '#3f4b8a',
  turkuaz: '#2fa3a3',
  petrol: '#1f5c5c',
  yeşil: '#4a7c3a',
  haki: '#78815c',
  zeytin: '#6b6b3a',
  sarı: '#e8c547',
  hardal: '#c9a227',
  turuncu: '#d9722c',
  kahverengi: '#6b4a34',
  kahve: '#6b4a34',
  karamel: '#a86a3d',
  taba: '#8a5a34',
  vizon: '#8a7560',
  bej: '#d9cdb8',
  krem: '#e8dfc8',
  ekru: '#e4dcc8',
  taş: '#c9c0a8',
  kırmızı: '#c0322f',
  bordo: '#6e1f2a',
  pembe: '#d98aa3',
  'gül kurusu': '#b5757a',
  mor: '#6a4c8a',
  lila: '#a893c9',
  altın: '#c9a227',
  gümüş: '#b0b0ac',
};
const COLOR_NAME_MODIFIERS = ['açık', 'koyu', 'orta', 'parlak', 'mat'];

function resolveColorHex(name: string): string | null {
  const lower = name.toLocaleLowerCase('tr').trim();
  if (COLOR_NAME_HEX[lower]) return COLOR_NAME_HEX[lower];
  const words = lower.split(/\s+/).filter((w) => !COLOR_NAME_MODIFIERS.includes(w));
  const stripped = words.join(' ');
  if (COLOR_NAME_HEX[stripped]) return COLOR_NAME_HEX[stripped];
  const lastWord = words[words.length - 1];
  return (lastWord && COLOR_NAME_HEX[lastWord]) || null;
}

// AI kullanmadan, kural tabanlı tek cümle seçimi — açıklamayı cümle cümle baştan okur ve
// bakım/ölçü ile ilgili olmayan İLK cümleyi (ürünü tanımlayan açılış cümlesi) döndürür.
function extractDefiningSentence(description: string | null): string | null {
  if (!description) return null;
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const meaningful = sentences.find((s) => !DESCRIPTION_STOP_WORDS.some((w) => s.toLowerCase().includes(w)));
  return meaningful ?? sentences[0] ?? null;
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

// Yüzde kalıbı olmadan sadece malzeme adı geçen açıklamalar için (örn. "doğal pamuktan
// yapılmıştır" → "Pamuk") — yaygın kumaş adlarının Türkçe çekim ekleriyle (pamuktan,
// pamuklu, pamuğun vb.) eşleşen kaba bir liste; açıklamada en erken geçen malzemeye göre
// tek bir kelimeye indirgenir.
// Küçük harfe çevrilmiş metne karşı eşleştiriliyor (bkz. aşağı) — JS'in /i bayrağı
// Türkçe büyük "İ" harfini doğru küçültmediği için (İ → yanlışlıkla "i̇" olur),
// içerik önce toLocaleLowerCase('tr') ile normalize ediliyor.
const FABRIC_MATERIALS: { name: string; re: RegExp }[] = [
  { name: 'Pamuk', re: /pamu[kğ]\w*/ },
  { name: 'Paraşüt Kumaş', re: /paraşüt\w*/ },
  { name: 'Polyester', re: /polyester\w*/ },
  { name: 'Elastan', re: /elastan\w*/ },
  { name: 'Poliamid', re: /poliamid\w*/ },
  { name: 'Viskon', re: /visko[nz]\w*/ },
  { name: 'Keten', re: /keten\w*/ },
  { name: 'Yün', re: /y[üu]n\w*/ },
  { name: 'İpek', re: /ipek\w*/ },
  { name: 'Modal', re: /modal\w*/ },
  { name: 'Naylon', re: /naylon\w*/ },
  { name: 'Likra', re: /likra\w*|spandex\w*/ },
  { name: 'Rayon', re: /rayon\w*/ },
];

function extractFabricMaterialFallback(description: string | null): string | null {
  if (!description) return null;
  const lower = description.toLocaleLowerCase('tr');
  let best: { index: number; name: string } | null = null;
  for (const { name, re } of FABRIC_MATERIALS) {
    const match = lower.match(re);
    if (match && match.index !== undefined && (!best || match.index < best.index)) {
      best = { index: match.index, name };
    }
  }
  return best?.name ?? null;
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
  defaultHeaderTitle,
  pageNumber,
}: {
  item: CatalogItem;
  mediaChunk: MediaItem[];
  currency: CatalogDetail['currency'];
  discountPct: number;
  brandLogoUrl: string | null;
  defaultHeaderTitle: string;
  pageNumber: number;
}) {
  // Katalog Oluşturucu'da bu ürüne özel bir sayfa başlığı seçilmişse (bkz. "artırılabilir
  // başlık" özelliği) o kullanılır; yoksa kataloğun varsayılan başlığı.
  const headerTitle = item.headerTitleOverride || defaultHeaderTitle;
  const sizeLabels = item.product.sizes.map((s) => s.label);
  // Ürün Detay ekranında editörün elle girdiği bir kısa açıklama varsa öncelikli kullanılır;
  // yoksa açıklamadan kural tabanlı olarak (AI kullanılmadan) tek bir tanımlayıcı cümle çıkarılır.
  const descriptionExcerpt = item.product.shortDescription?.trim() || extractDefiningSentence(item.product.description);
  const fabricComposition =
    extractFabricComposition(item.product.description) ??
    extractFabricMaterialFallback(item.product.description) ??
    item.product.fabricInfo;
  const displayName = stripColorFromName(item.product.name, item.product.colorLabel);

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
                <div className="ed-panel-name">{displayName}</div>
                {descriptionExcerpt && <p className="ed-panel-description">{descriptionExcerpt}</p>}
              </div>
              <div className="ed-info-right">
                {item.product.colors.length > 0 && (
                  <div className="ed-color-dots">
                    {item.product.colors.map((c) => {
                      const hex = c.hexPreview ?? resolveColorHex(c.name);
                      return hex ? (
                        <span key={c.id} className="ed-color-dot" style={{ background: hex }} title={c.name} />
                      ) : (
                        // Adı bilinen bir renk sözlüğünde eşleşmeyen (yani gerçekten desen/baskı
                        // adıyla anılan, örn. "Çiçekli", "Leopar Desen") varyantlar için düz bir
                        // renk yerine "bu bir renk değil desen" mesajını veren çok renkli bir halka.
                        <span key={c.id} className="ed-color-dot ed-color-dot--pattern" title={c.name} />
                      );
                    })}
                  </div>
                )}
                <EdSizeLine sizes={sizeLabels} lengthLabelText={item.product.lengthLabel} />
                {fabricComposition && (
                  <div className="ed-fabric-line">
                    <strong>Kumaş:</strong> {fabricComposition}
                  </div>
                )}
                <div className="ed-price-block">
                  <span className="ed-price-label">Toptan Fiyat:</span>
                  <span className="ed-price-original">{formatPrice(item.originalPriceDisplay, currency)}</span>
                  <span className="ed-price-value">{formatPrice(item.priceDisplay, currency)}</span>
                  <span className="ed-price-discount">%{Math.round(discountPct)}</span>
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
  pageNumber,
}: {
  brandLogoUrl: string | null;
  pageNumber: number;
}) {
  return (
    <div className="pdf-page ed-about-page">
      <div className="ed-page-frame">
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
              <div className="ed-contact-value">+90 850 532 12 63</div>
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
  const defaultHeaderTitle = catalog.coverTitle || catalog.name;

  return (
    <div className="catalog-print editoryal">
      <div className="pdf-page ed-cover-page">
        {catalog.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={catalog.coverImageUrl} alt="" className="ed-cover-image" />
        )}
      </div>

      {productPages.map((pp, index) => (
        <EdProductPage
          key={pp.key}
          item={pp.item}
          mediaChunk={pp.chunk}
          currency={catalog.currency}
          discountPct={catalog.discountPct}
          brandLogoUrl={settings.brandLogoUrl}
          defaultHeaderTitle={defaultHeaderTitle}
          pageNumber={index + 2}
        />
      ))}

      <EdAboutPage brandLogoUrl={settings.brandLogoUrl} pageNumber={totalPages} />
    </div>
  );
}
