import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { chromium, type Browser, type Route } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { logger } from '../utils/logger';

// Büyük kataloglarda (ör. 201 ürün ≈ 300 sayfa, 1400+ görsel) tüm sayfaları tek Chromium
// sekmesinde açmak belleği tüketiyor: T-Soft'un "-B" görselleri ~3072x4578 ve her biri
// açıldığında ~56MB yer kaplıyor. Bu yüzden sayfalar küçük gruplar halinde, her grup kendi
// tarayıcısında üretilip sonda tek PDF'te birleştiriliyor.
const PAGES_PER_BATCH = 20;
const BATCH_ATTEMPTS = 2;
const DOCUMENT_TIMEOUT_MS = 180_000;
const BATCH_TIMEOUT_MS = 300_000;

// Ürün görselinin kutusu A4'te en fazla ~150mm yüksekliğinde: 1400px ≈ 235 DPI, baskı için
// yeterli. Kapak/bölüm kapakları web uygulamasından geldiği için bu küçültmeye girmiyor.
const MAX_IMAGE_EDGE_PX = 1400;
const IMAGE_JPEG_QUALITY = 80;
const IMAGE_FETCH_ATTEMPTS = 3;
const IMAGE_FETCH_TIMEOUT_MS = 60_000;

const PAGES_PLACEHOLDER = '<!--pdf-pages-->';

sharp.cache(false);
sharp.concurrency(1);

export interface RenderOptions {
  url: string;
  landscape: boolean;
  outputPath: string;
  workDir: string;
  onProgress?: (donePages: number, totalPages: number) => void;
}

interface PrintDocument {
  shell: string;
  pages: string[];
}

function launchBrowser(): Promise<Browser> {
  // Docker'da /dev/shm varsayılan olarak 64MB — büyük sayfalarda Chromium sekmesi bu yüzden çöküyor.
  return chromium.launch({ args: ['--disable-dev-shm-usage'] });
}

/** Yazdırma sayfasını görseller yüklenmeden açıp sayfa iskeletini ve her `.pdf-page`'in
 *  HTML'ini çıkarır — sunucu tarafı render'ı böylece grup başına tekrarlanmaz. */
async function loadPrintDocument(url: string): Promise<PrintDocument> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.route('**/*', (route) =>
      ['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()
    );

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DOCUMENT_TIMEOUT_MS });
    if (!response?.ok()) throw new Error(`Katalog sayfası açılamadı (HTTP ${response?.status() ?? 'yanıt yok'})`);

    const printDocument = await page.evaluate((placeholder) => {
      const pages = Array.from(document.querySelectorAll('.catalog-print .pdf-page')).map((el) => el.outerHTML);
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      const root = clone.querySelector('.catalog-print');
      if (!root || pages.length === 0) return null;
      clone.querySelectorAll('script, link[rel="preload"][as="image"]').forEach((el) => el.remove());
      root.innerHTML = placeholder;
      return { shell: `<!doctype html>${clone.outerHTML}`, pages };
    }, PAGES_PLACEHOLDER);

    if (!printDocument) throw new Error('Katalog sayfasında yazdırılacak sayfa bulunamadı');
    return printDocument;
  } finally {
    await browser.close();
  }
}

/** Aynı renk varyantı birçok üründe tekrar ettiği için her görsel iş başına bir kez işlenir. */
class ImageCache {
  private readonly entries = new Map<string, Promise<string>>();
  failedCount = 0;

  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  get(url: string): Promise<string> {
    const cached = this.entries.get(url);
    if (cached) return cached;
    const entry = this.download(url);
    this.entries.set(url, entry);
    entry.catch(() => this.entries.delete(url));
    return entry;
  }

  private async download(url: string): Promise<string> {
    const filePath = path.join(this.dir, `${crypto.createHash('sha1').update(url).digest('hex')}.jpg`);
    let lastError: unknown;
    for (let attempt = 1; attempt <= IMAGE_FETCH_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const source = Buffer.from(await res.arrayBuffer());
        await sharp(source)
          .rotate()
          .resize({ width: MAX_IMAGE_EDGE_PX, height: MAX_IMAGE_EDGE_PX, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .toColourspace('srgb')
          .jpeg({ quality: IMAGE_JPEG_QUALITY })
          .toFile(filePath);
        return filePath;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
}

async function handleImageRoute(route: Route, images: ImageCache): Promise<void> {
  const url = route.request().url();
  try {
    const filePath = await images.get(url);
    await route.fulfill({ path: filePath, contentType: 'image/jpeg' });
  } catch (err) {
    images.failedCount += 1;
    logger.warn(`[pdf] görsel alınamadı: ${url} (${err instanceof Error ? err.message : String(err)})`);
    await route.abort().catch(() => undefined);
  }
}

async function renderBatch(
  options: RenderOptions,
  html: string,
  batchIndex: number,
  images: ImageCache,
  outputPath: string
): Promise<void> {
  const { origin } = new URL(options.url);
  const documentUrl = `${options.url}?pdfBatch=${batchIndex}`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(BATCH_TIMEOUT_MS);
    // Belge gerçek adresten sunulmuş gibi gösteriliyor — about:blank üzerinde fontlar CORS'a takılır.
    await page.route('**/*', (route) => {
      const request = route.request();
      if (request.url() === documentUrl) return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
      if (request.resourceType() === 'image' && /^https?:/.test(request.url()) && !request.url().startsWith(origin)) {
        return handleImageRoute(route, images);
      }
      return route.continue();
    });

    await page.goto(documentUrl, { waitUntil: 'load', timeout: BATCH_TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: outputPath,
      // format:'A4' yerine açık width/height — .pdf-page'in şablona göre 210x297mm (dikey)
      // veya 297x210mm (yatay, bkz. print-base.css) render ettiği boyutla eşleşmesi gerekiyor.
      width: options.landscape ? '297mm' : '210mm',
      height: options.landscape ? '210mm' : '297mm',
      preferCSSPageSize: false,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
  } finally {
    await browser.close();
  }
}

async function mergePdfs(batchPaths: string[], outputPath: string): Promise<number> {
  const merged = await PDFDocument.create();
  for (const batchPath of batchPaths) {
    const batch = await PDFDocument.load(await fs.promises.readFile(batchPath), { updateMetadata: false });
    const pages = await merged.copyPages(batch, batch.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  await fs.promises.writeFile(outputPath, await merged.save({ useObjectStreams: false }));
  return merged.getPageCount();
}

/** Yazdırma sayfasını gruplar halinde PDF'e çevirip `outputPath`'e yazar. */
export async function renderPrintPageToPdf(options: RenderOptions): Promise<{ pageCount: number; failedImages: number }> {
  const { shell, pages } = await loadPrintDocument(options.url);
  const images = new ImageCache(path.join(options.workDir, 'images'));
  const batchPaths: string[] = [];
  options.onProgress?.(0, pages.length);

  for (let start = 0, batchIndex = 0; start < pages.length; start += PAGES_PER_BATCH, batchIndex++) {
    const batchPages = pages.slice(start, start + PAGES_PER_BATCH);
    const html = shell.replace(PAGES_PLACEHOLDER, () => batchPages.join(''));
    const batchPath = path.join(options.workDir, `batch-${batchIndex}.pdf`);

    for (let attempt = 1; ; attempt++) {
      try {
        await renderBatch(options, html, batchIndex, images, batchPath);
        break;
      } catch (err) {
        if (attempt >= BATCH_ATTEMPTS) throw err;
        logger.warn(`[pdf] grup ${batchIndex} yeniden deneniyor: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    batchPaths.push(batchPath);
    options.onProgress?.(start + batchPages.length, pages.length);
  }

  const pageCount = await mergePdfs(batchPaths, options.outputPath);
  return { pageCount, failedImages: images.failedCount };
}
