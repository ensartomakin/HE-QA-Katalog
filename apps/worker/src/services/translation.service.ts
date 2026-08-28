import { GoogleGenerativeAI } from '@google/generative-ai';

// İngilizce katalog üretiminde, editör tarafından elle çevrilmemiş ürün metinlerini
// (ad/açıklama/kısa açıklama/kumaş bilgisi) Türkçeden İngilizceye çevirmek için kullanılır
// (bkz. catalog.service.ts fillMissingEnglishContent). Önceki bir denemede (kısa açıklama
// ÜRETİMİ için, bkz. git geçmişi) Gemini canlıda güvenilir sonuç vermemişti — o görev serbest
// metin/özet üretimiydi; burası düz çeviri yaptığından daha deterministik olması beklenir.
// Yine de çağıran taraf (catalog.service.ts) her alanı ayrı try/catch ile dener ve hata
// durumunda mevcut Türkçe metne düşer — sayfa hiçbir zaman boş kalmaz.
const SYSTEM_PROMPT =
  'Sen bir moda kataloğu çevirmenisin. Sana Türkçe bir metin verilecek. Bu metni doğal, ' +
  'akıcı İngilizceye çevir. Anlamı ve tonu koru; metinde olmayan hiçbir bilgi ekleme veya ' +
  'çıkarma. Sadece çeviriyi döndür — başlık, tırnak işareti, açıklama veya not ekleme.';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY tanımlı değil — İngilizce çeviri üretilemiyor.');
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

export async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Çevrilecek metin boş.');

  const model = getClient().getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(trimmed);
  const translated = result.response.text().trim();
  if (!translated) throw new Error('Çeviri yanıtından metin alınamadı.');
  return translated;
}
