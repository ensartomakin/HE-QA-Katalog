export interface CatalogTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** Gerçek bir tasarım eklenene kadar kullanılan geçici düzen. */
  isPlaceholder?: boolean;
}

export const CATALOG_TEMPLATES: CatalogTemplateMeta[] = [
  {
    id: 'placeholder-klasik',
    name: 'Geçici Düzen',
    description: 'İlk özel şablon tasarımı eklenene kadar kullanılan geçici sayfa düzeni: kapak sayfası ve 3x2 ürün ızgarası.',
    isPlaceholder: true,
  },
];

export const DEFAULT_CATALOG_TEMPLATE_ID = CATALOG_TEMPLATES[0].id;

export const CATALOG_TEMPLATE_IDS = CATALOG_TEMPLATES.map((t) => t.id) as [string, ...string[]];
