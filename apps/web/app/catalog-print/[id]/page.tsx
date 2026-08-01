import '../print-base.css';
import { workerFetch } from '@/lib/worker-client';
import { resolveCatalogPrintTemplate } from '@/lib/catalog-print-templates';
import type { CatalogDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CatalogPrintPage({ params }: { params: { id: string } }) {
  const [{ catalog }, settings] = await Promise.all([
    workerFetch<{ catalog: CatalogDetail | null }>(`/api/catalogs/${params.id}`),
    workerFetch<{ brandLogoUrl: string | null }>('/api/settings'),
  ]);

  if (!catalog) {
    return (
      <div className="catalog-print">
        <div className="pdf-page" style={{ padding: '20mm 18mm' }}>
          <p>Katalog bulunamadı.</p>
        </div>
      </div>
    );
  }

  const Template = resolveCatalogPrintTemplate(catalog.templateId);
  return <Template catalog={catalog} settings={settings} />;
}
