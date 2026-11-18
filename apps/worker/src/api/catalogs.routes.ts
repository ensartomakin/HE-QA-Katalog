import crypto from 'crypto';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CATALOG_TEMPLATE_IDS, DEFAULT_CATALOG_TEMPLATE_ID } from '@he-qa/db';
import {
  createCatalog,
  getCatalogDetail,
  listCatalogs,
  updateCatalogCoverImage,
  updateCatalogItemsOrder,
  updateCatalogItemVariantOrder,
  updateCatalogItemFocalPoint,
} from '../services/catalog.service';
import { getCatalogPdfPath, getCatalogPdfStatus, startCatalogPdfJob } from '../services/pdf.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/async-handler';

export const catalogsRouter = Router();

function verifyPdfDownloadSignature(catalogId: string, exp: string, sig: string): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', key).update(`pdf-download:${catalogId}:${exp}`).digest();
  const actual = Buffer.from(sig, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const createSchema = z.object({
  name: z.string().min(1),
  coverTitle: z.string().optional(),
  coverSubtitle: z.string().optional(),
  currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
  templateId: z.enum(CATALOG_TEMPLATE_IDS).default(DEFAULT_CATALOG_TEMPLATE_ID),
  language: z.enum(['TR', 'AR', 'EN']).default('TR'),
  showPrices: z.boolean().default(true),
  productIds: z.array(z.string()).min(1),
  createdBy: z.string().min(1),
  titleOverrides: z.record(z.string(), z.string()).optional(),
});

catalogsRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const catalog = await createCatalog(parsed.data);
      res.json({ catalog });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[catalogs/create] ${message}`);
      res.status(400).json({ error: message });
    }
  })
);

catalogsRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const catalogs = await listCatalogs();
    res.json({ catalogs });
  })
);

catalogsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const catalog = await getCatalogDetail(req.params.id);
    if (!catalog) {
      res.status(404).json({ error: 'Katalog bulunamadı' });
      return;
    }
    res.json({ catalog });
  })
);

const updateCoverImageSchema = z.object({
  // Object storage kurulu değil (bkz. apps/worker/src/api/settings.routes.ts brandLogoUrl ile
  // aynı desen) — kapak görseli tarayıcıda base64 data URL'e çevrilip doğrudan saklanıyor.
  // null: kapak görselini kaldır.
  coverImageUrl: z.string().min(1).max(4_000_000).nullable(),
});

catalogsRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateCoverImageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const catalog = await updateCatalogCoverImage(req.params.id, parsed.data.coverImageUrl);
      res.json({ catalog });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[catalogs/update] ${message}`);
      res.status(400).json({ error: message });
    }
  })
);

const sortOrderSchema = z.object({ itemIds: z.array(z.string()).min(1) });

catalogsRouter.put(
  '/:id/sort-order',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = sortOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await updateCatalogItemsOrder(req.params.id, parsed.data.itemIds);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  })
);

const variantOrderSchema = z.object({ itemId: z.string().min(1), colorLabels: z.array(z.string()).min(1) });

catalogsRouter.put(
  '/:id/variant-order',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = variantOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await updateCatalogItemVariantOrder(req.params.id, parsed.data.itemId, parsed.data.colorLabels);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  })
);

const focalPointSchema = z.object({
  itemId: z.string().min(1),
  imageUrl: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

catalogsRouter.put(
  '/:id/focal-point',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = focalPointSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await updateCatalogItemFocalPoint(req.params.id, parsed.data.itemId, parsed.data.imageUrl, parsed.data.x, parsed.data.y);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  })
);

catalogsRouter.post(
  '/:id/generate',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await startCatalogPdfJob(req.params.id);
      res.status(202).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[catalogs/generate] ${message}`);
      res.status(502).json({ error: message });
    }
  })
);

catalogsRouter.get(
  '/:id/pdf-status',
  asyncHandler(async (req: Request, res: Response) => {
    const status = await getCatalogPdfStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: 'Katalog bulunamadı' });
      return;
    }
    res.json(status);
  })
);

// Vercel fonksiyonları büyük yanıtları taşıyamadığı için PDF tarayıcıya doğrudan worker'dan
// iner. Bu uç nokta internal key istemez; apps/web'in oturum kontrolünden sonra ürettiği
// kısa ömürlü imzayla korunur (bkz. apps/web/app/api/catalogs/[id]/pdf/route.ts).
export const publicCatalogsRouter = Router();

publicCatalogsRouter.get(
  '/:id/pdf',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!verifyPdfDownloadSignature(id, String(req.query.exp ?? ''), String(req.query.sig ?? ''))) {
      res.status(403).type('text/plain; charset=utf-8').send('İndirme bağlantısının süresi dolmuş. Katalog sayfasından tekrar indirin.');
      return;
    }

    const filePath = getCatalogPdfPath(id);
    // Railway konteyner diski kalıcı değil — her deploy'da generated-pdfs/ siliniyor, ama
    // katalog DB'de READY kalıyor. Dosya yoksa PDF arka planda yeniden üretilir.
    if (!fs.existsSync(filePath)) {
      await startCatalogPdfJob(id);
      res.status(202).type('text/plain; charset=utf-8').send('PDF yeniden hazırlanıyor. Birkaç dakika sonra katalog sayfasından tekrar indirin.');
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename="katalog-${id}.pdf"`);
    res.sendFile(filePath);
  })
);
