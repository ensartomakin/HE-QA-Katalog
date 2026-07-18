import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { runFullSync } from '../services/sync.service';
import { logger } from '../utils/logger';

export const syncRouter = Router();

// Yalnızca manuel tetikleme — otomatik/zamanlanmış senkron MVP kapsamında yok (netleşti).
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
