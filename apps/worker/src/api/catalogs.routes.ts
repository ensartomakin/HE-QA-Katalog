import fs from 'fs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createCatalog, getCatalogDetail, listCatalogs } from '../services/catalog.service';
import { generateCatalogPdf, getCatalogPdfPath } from '../services/pdf.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/async-handler';

export const catalogsRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  coverTitle: z.string().optional(),
  coverSubtitle: z.string().optional(),
  currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
  productIds: z.array(z.string()).min(1),
  createdBy: z.string().min(1),
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

catalogsRouter.post(
  '/:id/generate',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const pdfUrl = await generateCatalogPdf(req.params.id);
      res.json({ ok: true, pdfUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[catalogs/generate] ${message}`);
      res.status(502).json({ error: message });
    }
  })
);

catalogsRouter.get(
  '/:id/pdf',
  asyncHandler(async (req: Request, res: Response) => {
    const filePath = getCatalogPdfPath(req.params.id);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'PDF henüz üretilmedi' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filePath).pipe(res);
  })
);
