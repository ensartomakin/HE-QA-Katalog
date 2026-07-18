/**
 * Tek doğruluk kaynağı: toptan fiyat hesaplama.
 * Hem admin panel (UI önizleme) hem PDF üretim motoru bu fonksiyonu import eder —
 * mantık iki yerde ayrı ayrı yazılmaz (bkz. docs/SISTEM-TASARIMI.md §2, §6).
 *
 * Sıra sabittir: önce TRY üzerinde indirim uygulanır, sonra hedef para birimine çevrilir.
 * Ters sıra (önce çevrim, sonra indirim) farklı yuvarlama sonuçları üretebileceğinden kullanılmaz.
 */

export interface PriceCalculationInput {
  sourcePriceTry: number;
  discountPct: number;
  ratePerTry: number; // 1 <hedef para birimi> = ratePerTry TRY (TRY için her zaman 1)
}

export interface PriceCalculationResult {
  wholesaleTry: number;
  displayPrice: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePrice({
  sourcePriceTry,
  discountPct,
  ratePerTry,
}: PriceCalculationInput): PriceCalculationResult {
  if (sourcePriceTry < 0) {
    throw new Error(`sourcePriceTry negatif olamaz: ${sourcePriceTry}`);
  }
  if (discountPct < 0 || discountPct > 100) {
    throw new Error(`discountPct 0-100 aralığında olmalı: ${discountPct}`);
  }
  if (ratePerTry <= 0) {
    throw new Error(`ratePerTry pozitif olmalı: ${ratePerTry}`);
  }

  const wholesaleTry = round2(sourcePriceTry * (1 - discountPct / 100));
  const displayPrice = round2(wholesaleTry / ratePerTry);

  return { wholesaleTry, displayPrice };
}
