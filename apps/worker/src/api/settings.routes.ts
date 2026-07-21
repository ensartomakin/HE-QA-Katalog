import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { upsertCredentials, hasCredentials } from '../db/credentials.repo';
import { testConnection } from '../services/tsoft-client';
import { resetTsoftClientCache } from '../services/tsoft-client';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/async-handler';

export const settingsRouter = Router();

const tsoftCredentialsSchema = z.object({
  apiUrl: z.string().url(),
  storeCode: z.string().min(1),
  apiUser: z.string().min(1),
  apiPass: z.string().min(1),
  apiToken: z.string().optional(),
});

settingsRouter.get(
  '/tsoft-credentials/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ configured: await hasCredentials() });
  })
);

settingsRouter.post(
  '/tsoft-credentials/test',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = tsoftCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await testConnection(parsed.data);
    res.json(result);
  })
);

settingsRouter.post(
  '/tsoft-credentials',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = tsoftCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await upsertCredentials(parsed.data);
    resetTsoftClientCache();
    logger.info('[settings] T-Soft kimlik bilgileri güncellendi');
    res.json({ ok: true });
  })
);

const settingsUpdateSchema = z.object({
  wholesaleDiscountPct: z.number().min(0).max(100).optional(),
  defaultCurrency: z.enum(['TRY', 'USD', 'EUR']).optional(),
  // Object storage kurulu değil (bkz. docs/SISTEM-TASARIMI.md §1) — marka logosu tarayıcıda
  // base64 data URL'e çevrilip doğrudan burada saklanıyor, bu yüzden url() değil serbest
  // metin kabul ediyoruz. max ~1.5MB'lık bir dosyaya karşılık gelen üst sınır DB'yi
  // büyük logoların şişirmesini engeller.
  brandLogoUrl: z.string().min(1).max(2_000_000).optional(),
});

settingsRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const settings = await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    res.json(settings);
  })
);

settingsRouter.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
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
  })
);

const exchangeRateUpdateSchema = z.object({
  currency: z.enum(['USD', 'EUR']),
  ratePerTry: z.number().positive(),
});

// Kur zaman-serisi olarak tutuluyor (ExchangeRate.effectiveAt) — yeni kur girişi yeni bir
// satır olarak eklenir, okuma her zaman en güncel satırı alır (bkz. catalog.service.ts
// getExchangeRate). Geçmiş kataloglar bu sayede geçmişte üretildikleri anın kuruna bağlı kalabilir.
settingsRouter.get(
  '/exchange-rates',
  asyncHandler(async (_req: Request, res: Response) => {
    const currencies = ['USD', 'EUR'] as const;
    const rates = await Promise.all(
      currencies.map((currency) =>
        prisma.exchangeRate.findFirst({ where: { currency }, orderBy: { effectiveAt: 'desc' } })
      )
    );
    res.json({ rates: rates.filter((r) => r !== null) });
  })
);

settingsRouter.put(
  '/exchange-rates',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = exchangeRateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const rate = await prisma.exchangeRate.create({
      data: { currency: parsed.data.currency, ratePerTry: parsed.data.ratePerTry, source: 'MANUAL' },
    });
    res.json(rate);
  })
);
