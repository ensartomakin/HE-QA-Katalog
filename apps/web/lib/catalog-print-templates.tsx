import type { ComponentType } from 'react';
import { DEFAULT_CATALOG_TEMPLATE_ID } from '@he-qa/db';
import type { CatalogDetail } from '@/lib/types';
import ZarifTemplate from '@/app/catalog-print/templates/zarif/Template';
import HeqaWebsiteTemplate from '@/app/catalog-print/templates/he-qa-website/Template';
import EditoryalTemplate from '@/app/catalog-print/templates/editoryal/Template';
import PlaceholderKlasikTemplate from '@/app/catalog-print/templates/placeholder-klasik/Template';

export interface CatalogPrintTemplateProps {
  catalog: CatalogDetail;
  settings: { brandLogoUrl: string | null };
}

/** Katalog.templateId -> render bileşeni eşlemesi. Yeni bir şablon eklerken:
 *  1) apps/web/app/catalog-print/templates/<id>/Template.tsx + .css oluştur
 *  2) packages/db/src/catalog-templates.ts içine kaydını ekle
 *  3) buraya bir satır ekle. */
export const CATALOG_PRINT_TEMPLATES: Record<string, ComponentType<CatalogPrintTemplateProps>> = {
  zarif: ZarifTemplate,
  'he-qa-website': HeqaWebsiteTemplate,
  editoryal: EditoryalTemplate,
  'placeholder-klasik': PlaceholderKlasikTemplate,
};

export function resolveCatalogPrintTemplate(templateId: string): ComponentType<CatalogPrintTemplateProps> {
  return CATALOG_PRINT_TEMPLATES[templateId] ?? CATALOG_PRINT_TEMPLATES[DEFAULT_CATALOG_TEMPLATE_ID];
}
