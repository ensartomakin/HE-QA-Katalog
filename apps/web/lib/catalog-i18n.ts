import type { CatalogLanguage } from '@/lib/types';

// Basılan katalog şablonlarının kullandığı sabit metinler + sayı biçimlendirme locale'i —
// katalog başına TEK dil (Catalog.language) seçilir, aynı sayfada iki dil birden gösterilmez.
// Yeni bir şablon eklendiğinde tek yapması gereken getCatalogStrings(catalog.language)
// çağırmak; Arapça (RTL) içerik ve düzeni ayrı bir aşamada eklenecek — o güne kadar AR,
// katalog oluşturma formunda seçenek olarak sunulmadığından pratikte kullanılmaz ama
// enum tip güvenliği bozulmasın diye TR sözlüğüne düşer.
export interface CatalogStrings {
  /** Fiyat/tarih biçimlendirmede kullanılacak Intl locale'i */
  locale: string;
  /** Şablon kökü için `lang` özniteliği — kök layout `<html lang="tr">` sabit olduğundan,
   *  bunu katalog içeriğinin dilini yansıtacak şekilde override etmezsek tarayıcı
   *  text-transform:uppercase'i Türkçe kurallarıyla uygular (İngilizce "light" → "LİGHT"
   *  gibi noktalı İ hatasına yol açar, bkz. CSS Text Module Level 3 Türkçe İ istisnası). */
  htmlLang: string;
  size: string;
  length: string;
  fabric: string;
  wholesalePrice: string;
  aboutHeading: string;
  aboutText: string;
  contactHeading: string;
  phoneLabel: string;
  addressLabel: string;
  webLabel: string;
}

const STRINGS: Record<'TR' | 'EN', CatalogStrings> = {
  TR: {
    locale: 'tr-TR',
    htmlLang: 'tr',
    size: 'Beden:',
    length: 'Boy:',
    fabric: 'Kumaş:',
    wholesalePrice: 'Toptan Fiyat:',
    aboutHeading: 'HAKKIMIZDA',
    aboutText:
      '2014 yılında kurulan EKD TEKSTİL SAN. VE TİC. LTD ŞTİ, faaliyete geçtiği günden bu yana kaliteyi ilke ' +
      'edinmiş, doğal içerikli kumaşları ulaşılabilir fiyatlarla müşterilerine sunan çevreye saygılı bir markadır.',
    contactHeading: 'İLETİŞİM',
    phoneLabel: 'Telefon',
    addressLabel: 'Adres',
    webLabel: 'Web',
  },
  EN: {
    locale: 'en-US',
    htmlLang: 'en',
    size: 'Size:',
    length: 'Length:',
    fabric: 'Fabric:',
    wholesalePrice: 'Wholesale Price:',
    aboutHeading: 'ABOUT US',
    aboutText:
      'Founded in 2014, EKD TEKSTİL SAN. VE TİC. LTD ŞTİ has made quality its guiding principle since day one, ' +
      'offering naturally sourced fabrics at accessible prices as an environmentally conscious brand.',
    contactHeading: 'CONTACT',
    phoneLabel: 'Phone',
    addressLabel: 'Address',
    webLabel: 'Web',
  },
};

export function getCatalogStrings(language: CatalogLanguage): CatalogStrings {
  return STRINGS[language as 'TR' | 'EN'] ?? STRINGS.TR;
}
