import { GoogleGenerativeAI } from '@google/generative-ai';

// İngilizce/Arapça katalog üretiminde, editör tarafından elle çevrilmemiş (İngilizce için
// ayrıca T-Soft'ta da bulunmayan, bkz. catalog.service.ts fillMissingEnglishContent) ürün
// metinlerini (ad/açıklama/kısa açıklama/kumaş bilgisi) Türkçeden hedef dile çevirmek için
// kullanılır. Önceki bir denemede (kısa açıklama ÜRETİMİ için, bkz. git geçmişi) Gemini
// canlıda güvenilir sonuç vermemişti — o görev serbest metin/özet üretimiydi; burası düz
// çeviri yaptığından daha deterministik olması beklenir. Yine de çağıran taraf her alanı
// ayrı try/catch ile dener ve hata durumunda mevcut Türkçe metne düşer — sayfa hiçbir zaman
// boş kalmaz.
export type TranslationTargetLanguage = 'English' | 'Arabic';

function systemPrompt(targetLanguage: TranslationTargetLanguage): string {
  return (
    `Sen bir moda kataloğu çevirmenisin. Sana Türkçe bir metin verilecek. Bu metni doğal, ` +
    `akıcı ${targetLanguage === 'Arabic' ? 'Arapçaya' : 'İngilizceye'} çevir. Anlamı ve tonu ` +
    `koru; metinde olmayan hiçbir bilgi ekleme veya çıkarma. Sayı ve ölçü birimlerini (cm, %, ` +
    `beden numaraları gibi) batı rakamlarıyla (0-9) aynen koru, Arapça-Hint rakamlarına çevirme. ` +
    `Sadece çeviriyi döndür — başlık, tırnak işareti, açıklama veya not ekleme.`
  );
}

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY tanımlı değil — çeviri üretilemiyor.');
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

// Gemini'nin ücretsiz katmanı dakikada çok düşük bir istek sınırına sahip (bkz. hata mesajı:
// "generate_content_free_tier_requests", quotaValue genelde 5/dk) — çok ürünlü bir katalogda
// (her ürün için ad/açıklama/kısa açıklama/kumaş = 4 istek) bu sınıra anında çarpılıyor ve
// çoğu alan 429 ile başarısız oluyor. BİLİNÇLİ OLARAK burada retry/bekleme YOK: Gemini'nin
// önerdiği bekleme süresi (~20-30sn) PDF üretimindeki Playwright zaman aşımını (60sn, bkz.
// pdf.service.ts) kolayca aşar — denenmişti (bkz. PR tartışması), tek istek 150sn'yi
// buluyordu. Hızlı başarısız olup çağıran tarafın (catalog.service.ts) Türkçe metne
// düşmesine izin vermek daha güvenli; eksik alanlar bir SONRAKİ önizleme/PDF isteğinde
// (kota penceresi sıfırlandıkça) kendiliğinden tamamlanır. Kalıcı çözüm: .env.example'da
// belirtildiği gibi bu API anahtarı için faturalandırmayı aktif etmek.
export async function translateText(text: string, targetLanguage: TranslationTargetLanguage): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Çevrilecek metin boş.');

  const model = getClient().getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    systemInstruction: systemPrompt(targetLanguage),
  });

  const result = await model.generateContent(trimmed);
  const translated = result.response.text().trim();
  if (!translated) throw new Error('Çeviri yanıtından metin alınamadı.');
  return translated;
}
