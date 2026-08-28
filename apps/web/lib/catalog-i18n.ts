import type { CatalogLanguage } from '@/lib/types';

// Basılan katalog şablonlarının kullandığı sabit metinler + sayı biçimlendirme locale'i —
// katalog başına TEK dil (Catalog.language) seçilir, aynı sayfada iki dil birden gösterilmez.
// Yeni bir şablon eklendiğinde tek yapması gereken getCatalogStrings(catalog.language)
// çağırmak; `direction`/`htmlLang` şablon kökünde `dir`/`lang` özniteliği olarak set
// edilmeli — flex tabanlı satırlar (bkz. editoryal.css) `dir="rtl"` altında tarayıcı
// tarafından otomatik olarak sağdan sola aynalanır, elle sütun sırası değiştirmeye gerek
// kalmaz. Fiyat/beden gibi rakamlar batı rakamlarıyla kalması için locale'e
// `-u-nu-latn` uzantısı eklendi (aksi halde Arapça locale'de Arapça-Hint rakamları kullanılır).
export interface CatalogStrings {
  /** Fiyat biçimlendirmede kullanılacak Intl locale'i */
  locale: string;
  /** Şablon kökü için `lang` özniteliği — kök layout `<html lang="tr">` sabit olduğundan,
   *  bunu katalog içeriğinin dilini yansıtacak şekilde override etmezsek tarayıcı
   *  text-transform:uppercase'i Türkçe kurallarıyla uygular (İngilizce "light" → "LİGHT"
   *  gibi noktalı İ hatasına yol açar, bkz. CSS Text Module Level 3 Türkçe İ istisnası). */
  htmlLang: string;
  /** Şablon kökü için `dir` özniteliği — Arapçada `rtl`, diğerlerinde `ltr`. */
  direction: 'ltr' | 'rtl';
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

const STRINGS: Record<CatalogLanguage, CatalogStrings> = {
  TR: {
    locale: 'tr-TR',
    htmlLang: 'tr',
    direction: 'ltr',
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
    direction: 'ltr',
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
  AR: {
    locale: 'ar-u-nu-latn',
    htmlLang: 'ar',
    direction: 'rtl',
    size: 'المقاس:',
    length: 'الطول:',
    fabric: 'القماش:',
    wholesalePrice: 'سعر الجملة:',
    aboutHeading: 'من نحن',
    aboutText:
      'تأسست شركة EKD TEKSTİL SAN. VE TİC. LTD ŞTİ عام 2014، وجعلت من الجودة مبدأً أساسياً لها منذ اليوم الأول، ' +
      'حيث تقدم أقمشة ذات مصادر طبيعية بأسعار في متناول الجميع كعلامة تجارية تراعي البيئة.',
    contactHeading: 'اتصل بنا',
    phoneLabel: 'الهاتف',
    addressLabel: 'العنوان',
    webLabel: 'الموقع',
  },
};

export function getCatalogStrings(language: CatalogLanguage): CatalogStrings {
  return STRINGS[language] ?? STRINGS.TR;
}
