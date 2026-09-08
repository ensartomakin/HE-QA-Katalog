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

// Gemini'nin ücretsiz katmanı dakikada düşük bir istek sınırına sahip ve bu sınır MODELE GÖRE
// DEĞİŞİYOR (bkz. hata mesajındaki "generate_content_free_tier_requests" quotaValue'su) —
// canlıda ölçüldü: düz "flash" modelleri (örn. gemini-3.6-flash) 5/dk ile sınırlıyken "lite"
// modelleri (gemini-3.5-flash-lite, gemini-3.1-flash-lite) 15/dk'ya izin veriyor — üç kat.
// Bu yüzden varsayılan burada bir "lite" model; çeviri gibi düz bir görev için kalite farkı
// gözle görülür değil. Yine de büyük bir katalogda (ürün başına birden fazla alan) bu limit
// aşılabilir — BİLİNÇLİ OLARAK burada retry/bekleme YOK: Gemini'nin önerdiği bekleme süresi
// (~15-35sn) PDF üretimindeki Playwright zaman aşımını (60sn, bkz. pdf.service.ts) kolayca
// aşar — denenmişti (bkz. PR tartışması), tek istek 150sn'yi buluyordu. Hızlı başarısız olup
// çağıran tarafın (catalog.service.ts) Türkçe metne düşmesine izin vermek daha güvenli; eksik
// alanlar bir SONRAKİ önizleme/PDF isteğinde (kota penceresi sıfırlandıkça) kendiliğinden
// tamamlanır. Ücretsiz katman yine de yetersiz kalırsa asıl çözüm .env.example'da belirtildiği
// gibi bu API anahtarı için faturalandırmayı aktif etmek (limit ~1000/dk'ya çıkıyor).
//
// Bir üründe çevrilmesi gereken birden fazla alan (ad/açıklama/kısa açıklama/kumaş) genelde
// aynı anda eksik oluyor — her biri için ayrı istek atmak dakikalık kotayı gereksiz yere 4
// katına çıkarır. Bunun yerine tüm eksik alanlar TEK bir Gemini isteğinde, JSON nesnesi
// olarak gönderilip yine JSON olarak çevrilmiş dönüyor — aynı ürün için gerekli istek sayısını
// 4'ten 1'e indiriyor (bkz. catalog.service.ts fillMissingEnglishContent/fillMissingArabicContent).
// Anahtar adları serbest — çağıran taraf hangi alanları göndermişse aynı anahtarlarla çevrilmiş
// halini geri alır; eksik/bozuk JSON gelirse (çok nadir ama JSON modunda bile olabiliyor) tüm
// istek başarısız sayılır, çağıran taraf mevcut try/catch'iyle o alanları Türkçe metne düşürür.
export async function translateFields(
  fields: Record<string, string>,
  targetLanguage: TranslationTargetLanguage
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value && value.trim()) input[key] = value.trim();
  }
  if (Object.keys(input).length === 0) return {};

  const model = getClient().getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite',
    systemInstruction:
      systemPrompt(targetLanguage) +
      ' Girdi bir JSON nesnesi olacak; her anahtarın değerini ayrı ayrı çevir ve AYNI anahtarlarla ' +
      'bir JSON nesnesi olarak döndür. Anahtar adlarını değiştirme, alan ekleme veya çıkarma yapma.',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(JSON.stringify(input));
  const raw = result.response.text().trim();
  if (!raw) throw new Error('Çeviri yanıtından metin alınamadı.');

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) output[key] = value.trim();
  }
  return output;
}
