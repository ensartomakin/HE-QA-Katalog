import './editoryal.css';
import {
  extractDefiningSentence,
  extractFabricComposition,
  extractFabricMaterialFallback,
  extractDefiningSentenceEn,
  extractFabricCompositionEn,
  extractFabricMaterialFallbackEn,
  stripColorFromName,
  stripColorWordsEn,
  stripColorWordsAr,
} from '@he-qa/db';
import type { CatalogDetail, CatalogItem, CatalogLanguage } from '@/lib/types';
import type { CatalogPrintTemplateProps } from '@/lib/catalog-print-templates';
import { upsizeTsoftImageUrl } from '@/lib/tsoft-image';
import { getCatalogStrings, type CatalogStrings } from '@/lib/catalog-i18n';

// Görseller object-fit:cover ile kutuya kırpılıyor (bkz. editoryal.css) — varsayılan odak
// noktası üstte tutuluyor ki manken fotoğraflarında kafa kırpılmasın. Kullanıcı önizlemede
// bu noktayı görsel bazında değiştirebilir (bkz. CatalogItem.imageFocalPoints).
const DEFAULT_FOCAL_POINT = { x: 0.5, y: 0.15 };

// Katalog için özel bir kapak görseli yüklenmediyse (bkz. catalogs/[id] sayfası "Kapak
// Görseli" alanı) bu editoryal marka görseli varsayılan olarak kullanılıyor.
const DEFAULT_COVER_IMAGE_URL = '/catalog-print/editoryal/default-cover.jpg';

// Kategori adını (ör. "Tunik / Gömlek", "T-Shirt", "Şal - Eşarp") karşılaştırmaya uygun
// hale getirir — Türkçe karakterler ASCII karşılığına çevrilir, geri kalan her şey (boşluk,
// "/", "-" vb.) atılır. sync.service.ts'teki slugify ile aynı harf dönüşümünü kullanır (bkz.
// orada tsoftCategoryId'siz hali).
function normalizeCategoryKey(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

// Ürünün kategorisi değiştiğinde, o kategorinin ürün sayfalarından önce eklenen tam sayfa
// "kategori kapağı" (bkz. public/catalog-print/editoryal/category-covers) — kategori adı
// zaten görselin içine gömülü olarak tasarlanmış, üstüne ayrıca metin basılmıyor.
//
// T-Soft'taki gerçek kategori ağacı (bkz. /api/products/categories) tek bir "Kaban" gibi
// sade bir isimden ibaret değil — aynı giysi türü onlarca alt/eş anlamlı kategoriye
// dağılmış durumda (ör. "Kaban Tümü", "Kaşe Kabanlar", "Kruvaze Kabanlar" hepsi kaban).
// Bu yüzden eşleme tek bir normalize edilmiş isim yerine, her kapak görseli için gerçek
// veride görülen kategori adlarının tam bir listesiyle yapılıyor (aşağıdaki liste canlı
// veritabanındaki 239 kategori taranarak çıkarıldı). Bazı sınıflandırmalar (ör. "Kapitone
// Montlar" → kaban, "Triko Elbise" → elbise, "Gömlek Elbiseler" → elbise) birebir isim
// eşleşmesi değil, en yakın temaya göre yapılan bir tercih — yeni/farklı bir kategori
// eklenirse veya bu eşleştirmelerden biri yanlış görünüyorsa buraya elle eklenip/taşınabilir.
const CATEGORY_COVER_GROUPS: { image: string; categoryNames: string[] }[] = [
  {
    image: 'pantolon.jpg',
    categoryNames: [
      'Pantolon',
      'Pantolon Tümü',
      'Ballon Pants',
      'Havuç Kesim Pantolanlar',
      'Keten Pantolonlar',
      'Palazzo Pantolon',
      'Şalvar',
      'Eşofman Altı',
      'Jean',
      'Jean Tümü',
      'Mom Comfort Jean',
      'Straight Fit Jean',
      'Wide Leg Jeanler',
    ],
  },
  {
    image: 'trenckot.jpg',
    categoryNames: ['Trençkot', 'Pardösü', 'Yağmurluk'],
  },
  {
    image: 'tunikgomlek.jpg',
    categoryNames: ['Tunik-Gömlek', 'Tunik-Gömlek Tümü', 'Uzun Tunik-Gömlek', 'Gömlek', 'Poplin Gömlek'],
  },
  {
    image: 'salesarp.jpg',
    categoryNames: [
      'Şal - Eşarp',
      'Şal - Eşarp Tümü',
      'Eşarp',
      'Desenli Şal',
      'Desenli Eşarp',
      'Desenli Dubline Soft Eşarp',
      'Desenli Twill Eşarp',
      'Soft Kraş Eşarp',
      'Soft Kraş Şal',
      'Likralı Soft Eşarp',
      'Likralı Soft Şal',
      'Aria Ekose Şal',
      'Aural Desenli Şal',
      'Frame Bloom Şal',
      'Jakarlı Şal',
      'Janjan Pearl Şal',
      'Kazayağı Desen Eşarp',
      'Kraş Şal',
      'Kraşlı Bambu Şal',
      'Lune Ekose Şal',
      'Natural Şal',
      'Pamuk Şal',
      'Pamuklu Desenli Şallar',
      'Penye Şal',
      'Pera Ekose Şal',
      'Point Şal',
      'Riva Ekose Şal',
      'Viskon Desenli Şallar',
      'Vintage Loom Şal',
      'Düz Renk Şal',
      'Dream Şal',
      'Yüzme Şalı',
      'Fular',
      'Boyunluk',
      'Scarf Styling',
      'Scarf Trend',
    ],
  },
  {
    image: 'abayaferace.jpg',
    categoryNames: ['Abaya / Ferace', 'Urban Abaya Ferace Koleksiyonu'],
  },
  { image: 'abiye.jpg', categoryNames: ['Abiye'] },
  { image: 'atki.jpg', categoryNames: ['Atkı'] },
  {
    image: 'canta.jpg',
    categoryNames: ['Çanta', 'Çanta Tümü', 'Hasır Çanta', 'Tote Çanta'],
  },
  {
    image: 'ceket.jpg',
    categoryNames: [
      'Ceket',
      'Ceket Tümü',
      'Blazer Ceketler',
      'Bomber Ceketler',
      'Deri Ceketler',
      'Keten Ceketler',
      'Kapitone Ceket',
      'Modal Ceket',
      'Scuba Ceket',
      'Süet Ceketler',
    ],
  },
  {
    image: 'corap.jpg',
    categoryNames: ['Çorap', 'Çorap Tümü', 'Soket Çorap', 'Dizaltı Çorap', 'Baklava Desenli Çoraplar'],
  },
  {
    image: 'elbise.jpg',
    categoryNames: [
      'Elbise',
      'Elbise Tümü',
      'Brode Elbiseler',
      'Denim Elbiseler',
      'Ekose Elbiseler',
      'Gömlek Elbiseler',
      'Keten Elbise',
      'Müslin Elbiseler',
      'Triko Elbise',
    ],
  },
  { image: 'eldiven.jpg', categoryNames: ['Eldiven'] },
  {
    image: 'etek.jpg',
    categoryNames: [
      'Etek',
      'Etek Tümü',
      'Bohem Etekler',
      'Ekose Etekler',
      'Maxi Skirt',
      'Long Skirt',
      'Müslin/Vual Etekler',
      'Pileli Etekler',
      'Saten Etekler',
    ],
  },
  {
    image: 'kaban.jpg',
    categoryNames: ['Kaban', 'Kaban Tümü', 'Kaşe Kabanlar', 'Kruvaze Kabanlar', 'Kapitone Montlar', 'Kap'],
  },
  { image: 'tshirt.jpg', categoryNames: ['T-shirt'] },
  { image: 'takim.jpg', categoryNames: ['Takım', 'Spor Takım'] },
  {
    image: 'tesetturmayo.jpg',
    categoryNames: ['Tesettür Mayo', 'Modest NXT Swimwear Koleksiyonu', 'Mayo Pantolon'],
  },
  {
    image: 'tesetturmayoaksesuarlari.jpg',
    categoryNames: ['Pareo', 'Yüzücü Bonesi', 'Yüzücü Başlıkları'],
  },
  {
    image: 'triko.jpg',
    categoryNames: ['Triko', 'Triko Tümü', 'Triko Takım', 'Kazak', 'Süveter', 'Hırka'],
  },
];

// Dosya adı aynı (ör. "kaban.jpg"), yalnızca klasör dile göre değişiyor — Türkçe kapaklar
// public/catalog-print/editoryal/category-covers, İngilizce çevirileri ise aynı isimlerle
// .../category-covers-en altında duruyor. İngilizce kataloglarda İngilizce tasarım varsa o
// kullanılır; yoksa (ör. ileride yeni bir kategori eklenip henüz İngilizce tasarımı
// hazırlanmadıysa) Türkçe kapağa düşülür.
const CATEGORY_COVER_IMAGE_FILE: Record<string, string> = Object.fromEntries(
  CATEGORY_COVER_GROUPS.flatMap(({ image, categoryNames }) => categoryNames.map((name) => [normalizeCategoryKey(name), image]))
);

// public/catalog-print/editoryal/category-covers-en altında gerçekten mevcut olan dosyalar —
// ileride Türkçe tarafa yeni bir kategori eklenip henüz İngilizce tasarımı hazırlanmadıysa
// buradan düşülüp Türkçe kapağın gösterilmesi için (bkz. resolveCategoryCoverImageUrl).
const CATEGORY_COVER_EN_FILES = new Set([
  'abayaferace.jpg',
  'canta.jpg',
  'kaban.jpg',
  'elbise.jpg',
  'abiye.jpg',
  'eldiven.jpg',
  'ceket.jpg',
  'triko.jpg',
  'tesetturmayoaksesuarlari.jpg',
  'tesetturmayo.jpg',
  'pantolon.jpg',
  'atki.jpg',
  'salesarp.jpg',
  'etek.jpg',
  'corap.jpg',
  'takim.jpg',
  'tshirt.jpg',
  'trenckot.jpg',
  'tunikgomlek.jpg',
]);

function resolveCategoryCoverImageUrl(categoryKey: string, language: CatalogLanguage): string | null {
  const file = CATEGORY_COVER_IMAGE_FILE[categoryKey];
  if (!file) return null;
  const dir = language === 'EN' && CATEGORY_COVER_EN_FILES.has(file) ? 'category-covers-en' : 'category-covers';
  return `/catalog-print/editoryal/${dir}/${file}`;
}

// T-Soft'ta ürünün kendi kategorisi (Product.categoryId) yanlış/eksik atanmış olabiliyor —
// ör. "Spor Kesim Deri Ceket" T-Soft'ta "Trençkot" kategorisine de ekli ama ana kategorisi
// aslında "Ceket" (bkz. kullanıcı geri bildirimi). Kaynak veriyi düzeltmek yerine (T-Soft
// tarafı, buradan değiştirilemiyor) burada ürün koduna göre bölüm kapağını override ediyoruz.
const PRODUCT_CATEGORY_KEY_OVERRIDE: Record<string, string> = {
  T6721: 'ceket', // Spor Kesim Deri Ceket Bordo
  T6722: 'ceket', // Spor Kesim Deri Ceket Yosun
  T6723: 'ceket', // Spor Kesim Deri Ceket Camel
  T6724: 'ceket', // Spor Kesim Deri Ceket Kemik
  T6725: 'ceket', // Spor Kesim Deri Ceket Siyah
  T6726: 'ceket', // Spor Kesim Deri Ceket Kahve
};

function resolveCategoryKey(item: CatalogItem): string {
  return PRODUCT_CATEGORY_KEY_OVERRIDE[item.product.code] ?? normalizeCategoryKey(item.product.category.name);
}

function focalPointStyle(item: CatalogItem, imageUrl: string): { objectPosition: string } {
  const focal = item.imageFocalPoints?.[imageUrl] ?? DEFAULT_FOCAL_POINT;
  return { objectPosition: `${focal.x * 100}% ${focal.y * 100}%` };
}

const CURRENCY_SYMBOL: Record<CatalogDetail['currency'], string> = {
  TRY: 'TL',
  USD: '$',
  EUR: '€',
};

// Kumaş bilgisi bazen T-Soft/çeviri kaynağına göre küçük harfle ("80% polyamide...") bazen
// büyük harfle ("Parachute Fabric") başlayabiliyor — tutarlılık için ilk harf her zaman
// büyütülüyor (bkz. konuşma). Metin çoğunlukla "80% ..." gibi bir yüzde/sayıyla başladığından
// (index 0'daki rakamda büyük/küçük harf ayrımı yok) ilk harf karakteri, string'in en
// başındaki rakam/sembolleri atlayarak aranıyor. toLocaleUpperCase kullanılıyor ki
// Türkçe'de "i" doğru şekilde "İ" olsun (düz .toUpperCase() bunu "I" yapardı).
function capitalizeFirst(text: string, locale: string): string {
  const match = text.match(/\p{L}/u);
  if (!match || match.index === undefined) return text;
  const idx = match.index;
  return text.slice(0, idx) + text.charAt(idx).toLocaleUpperCase(locale) + text.slice(idx + 1);
}

// Kuruş/cent basılmıyor — küsuratlı fiyat hem sağ sütunun dar genişliğinde taşmaya yol
// açıyordu hem de kullanıcı tercihiyle en yakın tam sayıya yuvarlanıyor (0.5 ve üzeri
// yukarı, altı aşağı — Math.round zaten bu kuralı uyguluyor).
function formatPrice(value: number, currency: CatalogDetail['currency'], locale: string): string {
  return `${Math.round(value).toLocaleString(locale)} ${CURRENCY_SYMBOL[currency]}`;
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

function EdSizeLine({
  sizes,
  lengthLabelText,
  strings,
}: {
  sizes: string[];
  lengthLabelText: string | null;
  strings: CatalogStrings;
}) {
  if (sizes.length === 0 && !lengthLabelText) return null;
  return (
    <div className="ed-size-line">
      {sizes.length > 0 && (
        <span>
          <strong>{strings.size}</strong> {sizes.join(' ')}
        </span>
      )}
      {lengthLabelText && (
        <span>
          <strong>{strings.length}</strong> {lengthLabelText}
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
  language,
  strings,
}: {
  item: CatalogItem;
  mediaChunk: MediaItem[];
  currency: CatalogDetail['currency'];
  discountPct: number;
  brandLogoUrl: string | null;
  defaultHeaderTitle: string;
  pageNumber: number;
  language: CatalogLanguage;
  strings: CatalogStrings;
}) {
  // Katalog Oluşturucu'da bu ürüne özel bir sayfa başlığı seçilmişse (bkz. "artırılabilir
  // başlık" özelliği) o kullanılır; yoksa kataloğun varsayılan başlığı.
  const headerTitle = item.headerTitleOverride || defaultHeaderTitle;
  const sizeLabels = item.product.sizes.map((s) => s.label);
  // Ürün Detay ekranında editörün elle girdiği bir kısa açıklama varsa öncelikli kullanılır;
  // yoksa açıklamadan kural tabanlı olarak (AI kullanılmadan) tek bir tanımlayıcı cümle çıkarılır.
  const trExcerpt = item.product.shortDescription?.trim() || extractDefiningSentence(item.product.description);
  const trFabric =
    extractFabricComposition(item.product.description) ??
    extractFabricMaterialFallback(item.product.description) ??
    item.product.fabricInfo;

  // İngilizce/Arapça katalogda önce editörün (veya Gemini çevirisinin) doldurduğu ilgili
  // dildeki alanlar denenir; hâlâ boşsa Türkçe metne düşülür (bkz. catalog.service.ts
  // fillMissingEnglishContent/fillMissingArabicContent — çeviri başarısız olursa bu alanlar
  // null kalabilir) — sayfa hiçbir zaman boş kalmaz. Arapça için T-Soft'ta karşılığı
  // olmadığından (yalnızca İngilizce "Dil" sekmesi var) kural tabanlı çıkarım yok —
  // shortDescriptionAr/fabricInfoAr zaten Türkçe kısa metnin doğrudan çevirisi.
  // nameEn/nameAr artık kaydedilirken zaten renk kelimesi kırpılmış olarak yazılıyor (bkz.
  // catalog.service.ts fillMissingEnglishContent/fillMissingArabicContent) — buradaki
  // stripColorWordsEn/Ar çağrıları eski (bu düzeltmeden önce) kaydedilmiş kayıtlar için bir
  // güvenlik ağı. TR'ye (veya çeviri henüz yoksa TR'ye düşen EN/AR) her zaman colorLabel ile
  // tam eşleşen stripColorFromName uygulanır.
  const displayName =
    language === 'EN' && item.product.nameEn
      ? stripColorWordsEn(item.product.nameEn) ?? item.product.nameEn
      : language === 'AR' && item.product.nameAr
        ? stripColorWordsAr(item.product.nameAr) ?? item.product.nameAr
        : stripColorFromName(item.product.name, item.product.colorLabel);
  const descriptionExcerpt =
    language === 'EN'
      ? item.product.shortDescriptionEn?.trim() || extractDefiningSentenceEn(item.product.descriptionEn) || trExcerpt
      : language === 'AR'
        ? item.product.shortDescriptionAr?.trim() || trExcerpt
        : trExcerpt;
  const fabricComposition =
    language === 'EN'
      ? item.product.fabricInfoEn ??
        extractFabricCompositionEn(item.product.descriptionEn) ??
        extractFabricMaterialFallbackEn(item.product.descriptionEn) ??
        trFabric
      : language === 'AR'
        ? item.product.fabricInfoAr ?? trFabric
        : trFabric;

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
                <EdSizeLine sizes={sizeLabels} lengthLabelText={item.product.lengthLabel} strings={strings} />
                {fabricComposition && (
                  <div className="ed-fabric-line">
                    <strong>{strings.fabric}</strong> {capitalizeFirst(fabricComposition, strings.locale)}
                  </div>
                )}
                <div className="ed-price-block">
                  <span className="ed-price-label">{strings.wholesalePrice}</span>
                  <span className="ed-price-original">{formatPrice(item.originalPriceDisplay, currency, strings.locale)}</span>
                  <span className="ed-price-value">{formatPrice(item.priceDisplay, currency, strings.locale)}</span>
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

// Kapak sayfasıyla aynı mantık: tasarımın tamamı görselin içinde olduğundan üstüne
// künye/sayfa numarası basılmaz, ama fiziksel bir sayfa olarak numaralandırmayı kaydırır
// (bkz. EditoryalTemplate'teki pageIndex sayacı).
function EdCategoryDividerPage({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="pdf-page ed-cover-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="ed-cover-image" />
    </div>
  );
}

function EdAboutPage({
  brandLogoUrl,
  pageNumber,
  strings,
}: {
  brandLogoUrl: string | null;
  pageNumber: number;
  strings: CatalogStrings;
}) {
  return (
    <div className="pdf-page ed-about-page">
      <div className="ed-page-frame">
        <div className="ed-about-layout">
          <div className="ed-about-col">
            <div className="ed-about-heading">{strings.aboutHeading}</div>
            <p className="ed-about-text">{strings.aboutText}</p>
          </div>

          <div className="ed-rule ed-rule-vertical" />

          <div className="ed-contact-col">
            <div className="ed-about-heading">{strings.contactHeading}</div>
            <div className="ed-contact-row">
              <div className="ed-label">{strings.phoneLabel}</div>
              <div className="ed-contact-value">+90 530 790 76 54</div>
            </div>
            <div className="ed-contact-row">
              <div className="ed-label">{strings.addressLabel}</div>
              <div className="ed-contact-value">Erenler Mah. 1201 Sk. No:5 B31 Meydan 54 AVM / Erenler/SAKARYA</div>
            </div>
            <div className="ed-contact-row">
              <div className="ed-label">{strings.webLabel}</div>
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

type EditoryalPage =
  | { type: 'divider'; key: string; imageUrl: string }
  | { type: 'product'; key: string; item: CatalogItem; chunk: MediaItem[] };

// Sıradaki ürünün kategorisi bir öncekinden farklıysa (bkz. normalizeCategoryKey) ve o
// kategori için bir kapak tasarımı varsa (bkz. resolveCategoryCoverImageUrl), o ürünün
// sayfalarından hemen önce bir bölüm kapağı eklenir. Aynı kategoriden ürünler ardışık
// değilse (kullanıcı sırayı elle karıştırdıysa) kapak her ardışık bloğun başında tekrar
// görünür.
function buildPages(items: CatalogItem[], language: CatalogLanguage): EditoryalPage[] {
  const pages: EditoryalPage[] = [];
  let lastCategoryKey: string | null = null;

  for (const item of items) {
    const categoryKey = resolveCategoryKey(item);
    if (categoryKey !== lastCategoryKey) {
      const dividerImageUrl = resolveCategoryCoverImageUrl(categoryKey, language);
      if (dividerImageUrl) {
        pages.push({ type: 'divider', key: `divider-${item.id}`, imageUrl: dividerImageUrl });
      }
      lastCategoryKey = categoryKey;
    }

    chunkMediaItems(buildMediaItems(item)).forEach((chunk, chunkIndex) => {
      pages.push({ type: 'product', key: `${item.id}-${chunkIndex}`, item, chunk });
    });
  }

  return pages;
}

export default function EditoryalTemplate({ catalog, settings }: CatalogPrintTemplateProps) {
  // Bir ürünün görsel sayısı sayfa başına düşen üst sınırı (8) aşarsa birden fazla sayfaya
  // bölünür (bkz. MAX_IMAGES_PER_PAGE), kategori değişimlerinde de bir bölüm kapağı araya
  // girer (bkz. buildPages) — bu yüzden sayfa sayısı artık catalog.items.length ile birebir
  // değil, toplam üretilen fiziksel sayfa sayısıyla belirleniyor.
  const pages = buildPages(catalog.items, catalog.language);
  const totalPages = pages.length + 2; // kapak + (bölüm kapağı + ürün) sayfaları + hakkımızda/iletişim
  const defaultHeaderTitle = catalog.coverTitle || catalog.name;
  const strings = getCatalogStrings(catalog.language);

  // Kapak ve bölüm kapağı sayfaları (görsel zaten tasarımın tamamını içerdiğinden) kendi
  // üstlerinde bir sayfa numarası göstermez, ama fiziksel sırada birer sayfa olarak sayılır
  // — bu yüzden ürün sayfalarının numarası, kendinden önceki kapak/bölüm sayfası sayısına
  // göre kayar (kapak zaten "1" işgal ediyor, bkz. eski sabit `index + 2`).
  let pageCursor = 1;

  return (
    <div className="catalog-print editoryal" lang={strings.htmlLang} dir={strings.direction}>
      <div className="pdf-page ed-cover-page">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={catalog.coverImageUrl || DEFAULT_COVER_IMAGE_URL} alt="" className="ed-cover-image" />
      </div>

      {pages.map((page) => {
        pageCursor += 1;
        if (page.type === 'divider') {
          return <EdCategoryDividerPage key={page.key} imageUrl={page.imageUrl} />;
        }
        return (
          <EdProductPage
            key={page.key}
            item={page.item}
            mediaChunk={page.chunk}
            currency={catalog.currency}
            discountPct={catalog.discountPct}
            brandLogoUrl={settings.brandLogoUrl}
            defaultHeaderTitle={defaultHeaderTitle}
            pageNumber={pageCursor}
            language={catalog.language}
            strings={strings}
          />
        );
      })}

      <EdAboutPage brandLogoUrl={settings.brandLogoUrl} pageNumber={totalPages} strings={strings} />
    </div>
  );
}
