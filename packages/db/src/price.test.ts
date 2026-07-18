import { describe, expect, it } from 'vitest';
import { calculatePrice } from './price';

describe('calculatePrice', () => {
  it('%40 indirimi TRY üzerinde uygular', () => {
    const { wholesaleTry } = calculatePrice({ sourcePriceTry: 2199.9, discountPct: 40, ratePerTry: 1 });
    expect(wholesaleTry).toBe(1319.94);
  });

  it('TRY için displayPrice = wholesaleTry (rate=1)', () => {
    const { wholesaleTry, displayPrice } = calculatePrice({ sourcePriceTry: 2199.9, discountPct: 40, ratePerTry: 1 });
    expect(displayPrice).toBe(wholesaleTry);
  });

  it('USD çevrimini indirimden SONRA uygular', () => {
    // wholesaleTry = 1319.94, rate = 34.0 → 1319.94 / 34 = 38.8217... → 38.82
    const { displayPrice } = calculatePrice({ sourcePriceTry: 2199.9, discountPct: 40, ratePerTry: 34 });
    expect(displayPrice).toBe(38.82);
  });

  it('x.xx5 sınır değerini standart yuvarlar (round-half-up)', () => {
    const { wholesaleTry } = calculatePrice({ sourcePriceTry: 100.005, discountPct: 0, ratePerTry: 1 });
    expect(wholesaleTry).toBe(100.01);
  });

  it('0 fiyatlı üründe hata fırlatmaz, 0 döner', () => {
    const { wholesaleTry, displayPrice } = calculatePrice({ sourcePriceTry: 0, discountPct: 40, ratePerTry: 1 });
    expect(wholesaleTry).toBe(0);
    expect(displayPrice).toBe(0);
  });

  it('negatif fiyatta hata fırlatır', () => {
    expect(() => calculatePrice({ sourcePriceTry: -10, discountPct: 40, ratePerTry: 1 })).toThrow();
  });

  it('geçersiz indirim yüzdesinde hata fırlatır', () => {
    expect(() => calculatePrice({ sourcePriceTry: 100, discountPct: 140, ratePerTry: 1 })).toThrow();
    expect(() => calculatePrice({ sourcePriceTry: 100, discountPct: -5, ratePerTry: 1 })).toThrow();
  });

  it('geçersiz kurda hata fırlatır', () => {
    expect(() => calculatePrice({ sourcePriceTry: 100, discountPct: 40, ratePerTry: 0 })).toThrow();
    expect(() => calculatePrice({ sourcePriceTry: 100, discountPct: 40, ratePerTry: -1 })).toThrow();
  });

  it('üç para birimi için de tutarlı sonuç üretir (aynı ürün, farklı kur)', () => {
    const input = { sourcePriceTry: 1319.94, discountPct: 0, ratePerTry: 1 };
    const try_ = calculatePrice(input);
    const usd = calculatePrice({ ...input, ratePerTry: 34 });
    const eur = calculatePrice({ ...input, ratePerTry: 37 });
    expect(try_.wholesaleTry).toBe(usd.wholesaleTry);
    expect(try_.wholesaleTry).toBe(eur.wholesaleTry);
    expect(usd.displayPrice).not.toBe(eur.displayPrice);
  });
});
