import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { upsertCredentials, hasCredentials } from '../db/credentials.repo';
import { testConnection } from '../services/tsoft-client';
import { resetTsoftClientCache } from '../services/tsoft-client';
import { logger } from '../utils/logger';

export const settingsRouter = Router();

const tsoftCredentialsSchema = z.object({
  apiUrl: z.string().url(),
  storeCode: z.string().min(1),
  apiUser: z.string().min(1),
  apiPass: z.string().min(1),
  apiToken: z.string().optional(),
});

settingsRouter.get('/tsoft-credentials/status', async (_req: Request, res: Response) => {
  res.json({ configured: await hasCredentials() });
});

settingsRouter.post('/tsoft-credentials/test', async (req: Request, res: Response) => {
  const parsed = tsoftCredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await testConnection(parsed.data);
  res.json(result);
});

settingsRouter.post('/tsoft-credentials', async (req: Request, res: Response) => {
  const parsed = tsoftCredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await upsertCredentials(parsed.data);
  resetTsoftClientCache();
  logger.info('[settings] T-Soft kimlik bilgileri güncellendi');
  res.json({ ok: true });
});

const settingsUpdateSchema = z.object({
  wholesaleDiscountPct: z.number().min(0).max(100).optional(),
  defaultCurrency: z.enum(['TRY', 'USD', 'EUR']).optional(),
  brandLogoUrl: z.string().url().optional(),
});

settingsRouter.get('/', async (_req: Request, res: Response) => {
  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
  res.json(settings);
});

settingsRouter.put('/', async (req: Request, res: Response) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  });
  res.json(settings);
});
