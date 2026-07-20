import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { logger } from '../utils/logger';
import { markCatalogFailed, markCatalogGenerating, markCatalogReady } from './catalog.service';

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated-pdfs');

function webUrl(): string {
  const url = process.env.WEB_URL;
  if (!url) throw new Error('WEB_URL tanımlı değil — worker, PDF üretmek için apps/web adresini bilmeli.');
  return url;
}

/**
 * Katalog PDF'ini üretir. `/catalog-print/:id` sayfası (apps/web) hem canlı önizleme
 * hem burada Playwright'ın ekran görüntüsünü aldığı PDF kaynağı olarak kullanılır —
 * "önizlediğin çıktıdır" garantisi böyle sağlanır (bkz. docs/SISTEM-TASARIMI.md §4).
 * MVP'de tek worker + senkron üretim yeterli (öngörülen hacim ~25 katalog/ay, bkz. §5);
 * BullMQ kuyruğu Faz 4'te 100+ ürünlük kataloglar için eklenecek.
 */
export async function generateCatalogPdf(catalogId: string): Promise<string> {
  await markCatalogGenerating(catalogId);

  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, `${catalogId}.pdf`);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const url = `${webUrl()}/catalog-print/${catalogId}`;
      logger.info(`[pdf] render başlıyor: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
    } finally {
      await browser.close();
    }

    const pdfUrl = `/pdfs/${catalogId}.pdf`;
    await markCatalogReady(catalogId, pdfUrl);
    logger.info(`[pdf] tamamlandı: ${filePath}`);
    return pdfUrl;
  } catch (err) {
    await markCatalogFailed(catalogId);
    logger.error(`[pdf] hata: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export function getCatalogPdfPath(catalogId: string): string {
  return path.join(OUTPUT_DIR, `${catalogId}.pdf`);
}
