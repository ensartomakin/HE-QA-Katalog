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
