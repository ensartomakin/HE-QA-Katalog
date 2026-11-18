import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import { getCatalogOrientation, markCatalogFailed, markCatalogGenerating, markCatalogReady } from './catalog.service';
import { renderPrintPageToPdf } from './pdf-renderer';

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated-pdfs');

function webUrl(): string {
  const url = process.env.WEB_URL;
  if (!url) throw new Error('WEB_URL tanımlı değil — worker, PDF üretmek için apps/web adresini bilmeli.');
  return url;
}

interface PdfJob {
  running: boolean;
  donePages: number;
  totalPages: number;
  error: string | null;
}

// Tek worker varsayımı (bkz. docs/SISTEM-TASARIMI.md §5): iş durumu bellekte tutuluyor ve
// büyük kataloglar belleği paylaşmasın diye işler sırayla çalışıyor.
const jobs = new Map<string, PdfJob>();
let queue: Promise<void> = Promise.resolve();

/**
 * Katalog PDF'ini üretir. `/catalog-print/:id` sayfası (apps/web) hem canlı önizleme hem
 * PDF kaynağı olarak kullanılır — "önizlediğin çıktıdır" garantisi böyle sağlanır
 * (bkz. docs/SISTEM-TASARIMI.md §4).
 */
async function generateCatalogPdf(catalogId: string, job: PdfJob): Promise<void> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `he-qa-pdf-${catalogId}-`));
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = getCatalogPdfPath(catalogId);
    const tempPath = path.join(workDir, 'catalog.pdf');
    const orientation = await getCatalogOrientation(catalogId);
    const url = `${webUrl()}/catalog-print/${catalogId}`;

    logger.info(`[pdf] render başlıyor: ${url}`);
    const { pageCount, failedImages } = await renderPrintPageToPdf({
      url,
      landscape: orientation === 'landscape',
      outputPath: tempPath,
      workDir,
      onProgress: (donePages, totalPages) => {
        job.donePages = donePages;
        job.totalPages = totalPages;
      },
    });

    // Üretim yarıda kalırsa önceki PDF bozulmasın diye dosya yalnızca tamamlanınca değiştiriliyor.
    fs.copyFileSync(tempPath, filePath);
    await markCatalogReady(catalogId, `/pdfs/${catalogId}.pdf`);
    logger.info(`[pdf] tamamlandı: ${filePath} (${pageCount} sayfa, ${failedImages} görsel alınamadı)`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** PDF üretimini arka planda başlatır ve hemen döner — büyük kataloglar dakikalar sürdüğü
 *  için HTTP isteği üretimin bitmesini beklemez; ilerleme getCatalogPdfStatus ile izlenir. */
export async function startCatalogPdfJob(catalogId: string): Promise<void> {
  if (jobs.get(catalogId)?.running) return;

  const job: PdfJob = { running: true, donePages: 0, totalPages: 0, error: null };
  jobs.set(catalogId, job);
  try {
    await markCatalogGenerating(catalogId);
  } catch (err) {
    jobs.delete(catalogId);
    throw err;
  }

  queue = queue.then(async () => {
    try {
      await generateCatalogPdf(catalogId, job);
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      logger.error(`[pdf] hata: ${job.error}`);
      await markCatalogFailed(catalogId).catch((markErr) => logger.error(`[pdf] durum yazılamadı: ${String(markErr)}`));
    } finally {
      job.running = false;
    }
  });
}

export async function getCatalogPdfStatus(catalogId: string) {
  const catalog = await prisma.catalog.findUnique({ where: { id: catalogId }, select: { status: true } });
  if (!catalog) return null;

  const job = jobs.get(catalogId);
  // Worker üretim sırasında yeniden başladıysa iş bellekten silinmiştir; katalog sonsuza
  // kadar "üretiliyor" durumunda kalmasın.
  if (catalog.status === 'GENERATING' && !job?.running) {
    await markCatalogFailed(catalogId);
    return { status: 'FAILED' as const, donePages: 0, totalPages: 0, error: 'Sunucu üretim sırasında yeniden başladı. Lütfen tekrar deneyin.' };
  }

  return {
    status: catalog.status,
    donePages: job?.donePages ?? 0,
    totalPages: job?.totalPages ?? 0,
    error: job?.error ?? null,
  };
}

export function getCatalogPdfPath(catalogId: string): string {
  return path.join(OUTPUT_DIR, `${catalogId}.pdf`);
}
