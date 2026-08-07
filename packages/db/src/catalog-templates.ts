export interface CatalogTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** Gerçek bir tasarım eklenene kadar kullanılan geçici düzen. */
  isPlaceholder?: boolean;
}

export const CATALOG_TEMPLATES: CatalogTemplateMeta[] = [
  {
    id: 'zarif',
    name: 'Zarif',
    description: 'Kapak fotoğrafı + sayfa başına 4 ürünlük vitrin: ana görsel, renk varyantı küçük görselleri, toptan fiyat, beden ve kumaş bilgisi.',
  },
  {
    id: 'he-qa-website',
    name: 'HE-QA Website',
    description: 'he-qa.com mağaza vitrinindeki ürün kartı stilini yansıtır: Inter fontu, sarı fiyat rozeti, çerçevesiz ürün görselleri, ince siyah çerçeveli metin kutuları.',
  },
  {
    id: 'placeholder-klasik',
    name: 'Geçici Düzen',
    description: 'İlk özel şablon tasarımı eklenene kadar kullanılan geçici sayfa düzeni: kapak sayfası ve 3x2 ürün ızgarası.',
    isPlaceholder: true,
  },
];

export const DEFAULT_CATALOG_TEMPLATE_ID = CATALOG_TEMPLATES[0].id;

export const CATALOG_TEMPLATE_IDS = CATALOG_TEMPLATES.map((t) => t.id) as [string, ...string[]];
