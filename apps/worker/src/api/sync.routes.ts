import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { runFullSync, syncCategories, syncCategoryProducts } from '../services/sync.service';
import { logger } from '../utils/logger';

export const syncRouter = Router();

// Yalnızca manuel tetikleme — otomatik/zamanlanmış senkron MVP kapsamında yok (netleşti).
// Tüm kategoriler + tüm ürünler — büyük katalog nedeniyle uzun sürebilir, "kaynakta
// silinen ürün" tespiti gibi kataloğun tamamını gerektiren işler için kullanılır.
syncRouter.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await runFullSync();
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[sync/run] ${message}`);
    res.status(502).json({ error: message });
  }
});

// Yalnızca kategori ağacı — hafif, Ürün Seçim Paneli'ndeki kategori seçiciyi doldurmak için.
syncRouter.post('/categories', async (_req: Request, res: Response) => {
  try {
    const map = await syncCategories();
    res.json({ count: map.size });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[sync/categories] ${message}`);
    res.status(502).json({ error: message });
  }
});

// Tek bir kategorinin ürünlerini anlık çeker — panelde kategori seçildiğinde çağrılır.
syncRouter.post('/category/:tsoftCategoryId', async (req: Request, res: Response) => {
  try {
    const result = await syncCategoryProducts(req.params.tsoftCategoryId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[sync/category] ${message}`);
    res.status(502).json({ error: message });
  }
});

syncRouter.get('/history', async (_req: Request, res: Response) => {
  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 });
  res.json({ runs });
});

syncRouter.get('/missing-products', async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { sourceMissingSince: { not: null } },
    select: { id: true, name: true, code: true, sourceMissingSince: true, missingSyncCount: true, archivedAt: true },
    orderBy: { sourceMissingSince: 'desc' },
  });
  res.json({ products });
});
