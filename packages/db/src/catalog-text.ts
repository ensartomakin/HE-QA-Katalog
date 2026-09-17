// Editoryal katalog şablonunun (apps/web) ürün açıklamalarından kural tabanlı metin
// çıkarımı için kullandığı yardımcılar. Aynı mantık, İngilizce katalog üretiminde hangi
// Türkçe metnin çevrileceğini hesaplamak için apps/worker tarafından da kullanılıyor
// (bkz. catalog.service.ts fillMissingEnglishContent) — bu yüzden tek doğruluk kaynağı
// olarak burada, paylaşılan pakette tutuluyor.

// Gerçek ürün açıklamaları (T-Soft'tan) genelde kumaş/kesim/amaç bilgisini tek bir açılış
// cümlesinde verip bakım talimatı, beden/ölçü tablosu gibi katalog sayfasına uygun olmayan
// uzun bir kuyrukla devam ediyor (bkz. "Spor Görünümlü Tesettür Mayo Takımı" örneği:
// "%80 poliamid ve %20 elastan karışımıyla üretilen bu tesettür mayo, deniz ve havuz
// kullanımında maksimum konfor sunmak için özel olarak tasarlanmıştır."). Bu liste, o
// açılış cümlesi yerine yanlışlıkla bir bakım/ölçü cümlesi seçilmesini önlemek için var.
const DESCRIPTION_STOP_WORDS = [
  'yıka', 'kuruma', 'kurut', 'ütü', 'beden:', 'boy:', 'boyu:', 'kalıp bilgisi', 'ölçü', 'iade', 'değişim', 'garanti', 'stok',
];

// AI kullanmadan, kural tabanlı tek cümle seçimi — açıklamayı cümle cümle baştan okur ve
// bakım/ölçü ile ilgili olmayan İLK cümleyi (ürünü tanımlayan açılış cümlesi) döndürür.
export function extractDefiningSentence(description: string | null): string | null {
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

export function extractFabricComposition(description: string | null): string | null {
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

export function extractFabricMaterialFallback(description: string | null): string | null {
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

// --- İngilizce sürümler ---
// T-Soft'un kendi İngilizce ürün açıklaması (bkz. worker tsoft-client.ts getProductLanguage,
// Language=en) gerçek, insan tarafından çevrilmiş metin olduğundan yukarıdaki TR odaklı
// kalıplarla eşleşmiyor — kelime sırası ters (örn. "%88 modal" değil "88% modal") ve durak
// kelimeleri İngilizce. Bu yüzden ayrı bir küme gerekiyor.
const DESCRIPTION_STOP_WORDS_EN = [
  'wash', 'dry clean', 'dry-clean', 'iron', 'size:', 'size chart', 'length:', 'fit information',
  'measurements', "model's measurements", 'return', 'exchange', 'warranty', 'stock', 'care instructions',
];

export function extractDefiningSentenceEn(description: string | null): string | null {
  if (!description) return null;
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const meaningful = sentences.find((s) => !DESCRIPTION_STOP_WORDS_EN.some((w) => s.toLowerCase().includes(w)));
  return meaningful ?? sentences[0] ?? null;
}

const FABRIC_COMPOSITION_ITEM_EN = '\\d+\\s*%\\s*[A-Za-z]+';
const FABRIC_COMPOSITION_RE_EN = new RegExp(`${FABRIC_COMPOSITION_ITEM_EN}(?:\\s*(?:,|and)\\s*${FABRIC_COMPOSITION_ITEM_EN})*`, 'i');

export function extractFabricCompositionEn(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(FABRIC_COMPOSITION_RE_EN);
  if (!match) return null;
  return match[0].replace(/\s+/g, ' ').trim();
}

const FABRIC_MATERIALS_EN: { name: string; re: RegExp }[] = [
  { name: 'Cotton', re: /cotton\w*/i },
  { name: 'Parachute Fabric', re: /parachute\w*/i },
  { name: 'Polyester', re: /polyester\w*|\bpes\b/i },
  { name: 'Elastane', re: /elastane\w*/i },
  { name: 'Polyamide', re: /polyamide\w*/i },
  { name: 'Viscose', re: /viscose\w*/i },
  { name: 'Linen', re: /linen\w*/i },
  { name: 'Wool', re: /wool\w*/i },
  { name: 'Silk', re: /silk\w*/i },
  { name: 'Modal', re: /modal\w*/i },
  { name: 'Nylon', re: /nylon\w*/i },
  { name: 'Lycra', re: /lycra\w*|spandex\w*/i },
  { name: 'Rayon', re: /rayon\w*/i },
];

export function extractFabricMaterialFallbackEn(description: string | null): string | null {
  if (!description) return null;
  let best: { index: number; name: string } | null = null;
  for (const { name, re } of FABRIC_MATERIALS_EN) {
    const match = description.match(re);
    if (match && match.index !== undefined && (!best || match.index < best.index)) {
      best = { index: match.index, name };
    }
  }
  return best?.name ?? null;
}

// --- Ürün adından renk kelimesi kırpma ---
// T-Soft'taki ürün adları genelde model adı + rengin/desenin adıyla bitiyor (örn.
// "RÜZGARLIK DETAYLI UZUN YÜZME TAKIMI AÇIK HAKİ" → model + "Açık Haki" rengi). Sayfada
// sadece modele ait kısmın kalması için, ürünün kendi colorLabel'i (T-Soft'un renk
// varyantı alanı, Türkçe) adın sonunda geçiyorsa kırpılır. Tam metin eşleşmesi kullanır
// (kelime listesine göre değil) çünkü colorLabel zaten o ürünün GERÇEK rengidir — bu
// yüzden Türkçe için en güvenilir yöntem budur.
export function stripColorFromName(name: string, colorLabel: string | null): string {
  const trimmedColor = colorLabel?.trim();
  if (!trimmedColor) return name;
  const lowerName = name.toLocaleLowerCase('tr');
  const lowerColor = trimmedColor.toLocaleLowerCase('tr');
  if (!lowerName.endsWith(lowerColor)) return name;
  return name.slice(0, name.length - trimmedColor.length).trim();
}

// İngilizce ürün adı T-Soft'un kendi "Dil" sekmesinden (insan çevirisi) geldiğinden bizim
// colorLabel alanımızla (Türkçe) birebir eşleşmiyor — bu yüzden TR'deki gibi tam metin
// eşleşmesi yerine bilinen renk/ton kelimelerinin listesine göre adın SONUNDAN geriye
// doğru kırpma yapılır (bkz. sync.service.ts BASE_COLOR_HSL/COLOR_MODIFIERS — aynı renk
// kümesinin İngilizce karşılıkları). "Light Khaki" gibi iki kelimelik adlar da desteklenir:
// önce "Khaki" (renk) kırpılır, sonra kalan son kelime "Light" (ton belirteci) de kırpılır.
const EN_COLOR_WORDS = new Set([
  'black', 'white', 'grey', 'gray', 'anthracite', 'charcoal', 'navy', 'blue', 'turquoise', 'teal',
  'green', 'khaki', 'olive', 'sage', 'eucalyptus', 'mustard', 'yellow', 'lemon', 'lime',
  'orange', 'apricot', 'peach', 'red', 'burgundy', 'wine', 'maroon', 'pink', 'fuchsia', 'magenta',
  'purple', 'lilac', 'lavender', 'mauve', 'plum', 'brown', 'chocolate', 'hazelnut', 'tan', 'camel',
  'mocha', 'taupe', 'beige', 'ecru', 'cream', 'ivory', 'mink', 'stone', 'sand', 'nude', 'bone',
  'pearl', 'coral', 'gold', 'silver', 'copper', 'bronze', 'indigo', 'denim', 'emerald', 'jade',
  'rose', 'salmon', 'rust', 'azure', 'cobalt',
  // Fashion katalog isimlerinde renk kelimesinden önce sık geçen bileşik ton/nitelik
  // belirteçleri (örn. "Almond Green", "Old Rose", "Royal Blue", "Brick Red") — bunlar
  // yalnız başlarına renk değil ama zaten renk kelimesi sıyrıldıktan sonra sonda kalan
  // anlamsız kalıntıyı temizlemek için gerekli.
  'almond', 'oil', 'moss', 'forest', 'brick', 'old', 'royal', 'ultra', 'warm', 'horizon',
  'reseda', 'bordeaux',
  // ton belirteçleri
  'light', 'dark', 'soft', 'ice', 'icy', 'night', 'bitter', 'baby', 'pastel', 'deep', 'bright', 'pale', 'dusty',
]);

// nameAr Gemini ile TÜRKÇE'den çevrildiği için (bkz. catalog.service.ts fillMissingArabicContent)
// asıl kalıcı çözüm çeviriye giden Türkçe metni önceden stripColorFromName ile temizlemek —
// bu liste sadece daha önce (bu düzeltmeden önce) rengi dahil çevrilmiş, veritabanında
// kayıtlı eski nameAr değerlerini temizlemek için bir güvenlik ağı olarak kullanılıyor.
const AR_COLOR_WORDS = new Set([
  'أسود', 'أبيض', 'رمادي', 'كحلي', 'أزرق', 'فيروزي', 'أخضر', 'كاكي', 'زيتوني', 'خردل', 'أصفر',
  'برتقالي', 'أحمر', 'خمري', 'عنابي', 'وردي', 'فوشيا', 'بنفسجي', 'أرجواني', 'بني', 'شوكولاتة',
  'بندقي', 'تان', 'جملي', 'موكا', 'بيج', 'بيز', 'كريمي', 'عاجي', 'منك', 'حجري', 'رملي', 'بيج فاتح',
  'لؤلؤي', 'مرجاني', 'ذهبي', 'فضي', 'نحاسي', 'برونزي', 'نيلي', 'دنيم', 'زمردي', 'يشمي', 'وردي فاتح',
  'سالمون', 'صدئي', 'سماوي', 'كوبالت', 'مرجان', 'فيزون', 'داكن', 'زيتي', 'بورغندي', 'طيني',
  // Gemini çevirisinde gözlemlenen alternatif yazım/varyant biçimleri (örn. "بني" yerine
  // elif ile "بنى", "منك" yerine "منكل"/"منسك").
  'بنى', 'منكل', 'منسك',
  // "لون"/"بلون"/"لوني" ("renk"/"renginde"/"rengi") — renk kelimesi kırpıldıktan sonra
  // anlamsız kalan "... rengi/renginde" kalıntısı da temizlenmeli (örn. "... لون بيج" →
  // sadece "بيج" değil "لون" da kırpılmalı, yoksa "... rengi" diye anlamsız kalır).
  'لون', 'بلون', 'بألوان', 'لوني',
  // ton belirteçleri
  'فاتح', 'غامق', 'ناعم', 'جليدي', 'ليلي', 'باستيل', 'عميق', 'زاهي', 'باهت',
]);

function normalizeColorToken(word: string): string {
  return word.replace(/[.,;:!?'"()]+$/g, '').toLocaleLowerCase();
}

// "Bordeaux-Dark" gibi tirele birleştirilmiş bileşik renk adlarını da yakalar — tirenin
// her iki tarafı da (ayrı ayrı) bilinen bir renk/ton kelimesiyse tüm token bir bütün
// olarak renk sayılır.
function isColorToken(word: string, colorWords: Set<string>): boolean {
  const normalized = normalizeColorToken(word);
  if (colorWords.has(normalized)) return true;
  if (normalized.includes('-')) {
    const parts = normalized.split('-').filter(Boolean);
    return parts.length > 0 && parts.every((p) => colorWords.has(p));
  }
  return false;
}

// Verilen kelime kümesindeki kelimeler adın sonundan kaldığı sürece tekrar tekrar kırpılır —
// böylece hem "... Khaki" hem "... Light Khaki" gibi çok kelimeli renk/ton kombinasyonları
// tek bir kelime listesiyle desteklenir.
function stripTrailingColorWords(name: string, colorWords: Set<string>): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && isColorToken(words[words.length - 1], colorWords)) {
    words.pop();
  }
  // Renk kelimesinden önce gelen "-", "," gibi ayraçlar da renkle birlikte anlamsızlaşır
  // (örn. "... Hilal - Bej" → "Bej" kırpılınca sonda yalnız "-" kalmamalı).
  return words.join(' ').replace(/[\s\-–—,،:;]+$/, '').trim();
}

export function stripColorWordsEn(name: string | null): string | null {
  if (!name) return name;
  return stripTrailingColorWords(name, EN_COLOR_WORDS);
}

export function stripColorWordsAr(name: string | null): string | null {
  if (!name) return name;
  return stripTrailingColorWords(name, AR_COLOR_WORDS);
}
