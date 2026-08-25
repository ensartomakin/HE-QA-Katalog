import { GoogleGenerativeAI } from '@google/generative-ai';

// Editoryal katalog şablonunda ürün açıklamasının yerini alan ~20 kelimelik özet
// (bkz. Template.tsx ed-panel-description) — kural tabanlı cümle kırpma yerine, tam
// açıklamayı okuyup onun kendi ton ve içeriğine sadık kalan bir özet üretir.
const SYSTEM_PROMPT =
  'Sen bir moda kataloğu editörüsün. Sana Türkçe bir ürün açıklaması verilecek. ' +
  'Bu açıklamanın tamamını oku ve TAM OLARAK 20 kelimelik, akıcı tek bir Türkçe cümle ' +
  'veya cümle grubu halinde özetle. Özet, açıklamada geçen kumaş/malzeme, öne çıkan ' +
  'özellik (ör. su itici, hızlı kuruma, esneklik) ve ürünün ne olduğu gibi somut ' +
  'bilgileri kullanmalı; açıklamada geçmeyen hiçbir iddia veya süsleme ekleme. ' +
  'Ton, açıklamanın kendi tonuna (kısa, bilgilendirici, pazarlama diline yakın) uygun ' +
  'olmalı. Ölçü tabloları, bakım talimatları, manken ölçüleri gibi teknik ekleri yok say. ' +
  'Sadece özet metni döndür — başlık, tırnak işareti veya açıklama ekleme.';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY tanımlı değil — kısa açıklama üretilemiyor.');
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

export async function generateShortDescription(description: string): Promise<string> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error('Ürünün açıklaması boş — özetlenecek metin yok.');

  const model = getClient().getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(trimmed);
  const text = result.response.text().trim();
  if (!text) throw new Error('AI yanıtından metin alınamadı.');
  return text;
}
