import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { asyncHandler } from '../utils/async-handler';
import { translateMissingProductsBatch } from '../services/catalog.service';
import { logger } from '../utils/logger';

export const productsRouter = Router();

const translateBatchSchema = z.object({ language: z.enum(['EN', 'AR']) });

// Ürün Yönetimi ekranındaki "Toplu Çeviri" bölümünden tetiklenir — henüz bu dile çevrilmemiş
// küçük bir ürün grubunu çevirip DB'ye yazar, kalan sayıyı döndürür. Web tarafı bu uç noktayı
// `remaining` sıfıra inene kadar art arda çağırarak TÜM kataloğu parça parça çevirir (bkz.
// catalog.service.ts translateMissingProductsBatch).
productsRouter.post(
  '/translate-batch',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = translateBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await translateMissingProductsBatch(parsed.data.language);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[products/translate-batch] ${message}`);
      res.status(502).json({ error: message });
    }
  })
);

const sortOrderSchema = z.object({ ids: z.array(z.string()).min(1) });

// Manuel sıralama sekmesindeki sürükle-bırak sonrası çağrılır — verilen id sırasına göre
// manualSortWeight'i 0, 1, 2… olarak yazar (products.routes.ts GET / sort=manual bu alana göre sıralıyor).
productsRouter.put(
  '/sort-order',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = sortOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await prisma.$transaction(
      parsed.data.ids.map((id, index) => prisma.product.update({ where: { id }, data: { manualSortWeight: index } }))
    );
    res.json({ ok: true });
  })
);

productsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { categoryIds, search, sort, ids } = req.query as { categoryIds?: string; search?: string; sort?: string; ids?: string };

    // Kategori, arama veya doğrudan id listesi olmadan sorgu çalıştırılmaz — "hangi kategoriyi
    // seçtiysem o kategoriye ait ürünleri getir, tüm kataloğu çekip sistemi şişirme" isteği
    // (bkz. konuşma). `ids` parametresi Katalog Oluşturucu'nun seçili ürünleri tek seferde
    // çekmesi için var (kategori/arama filtresine bağlı değil).
    if (!categoryIds && !search && !ids) {
      res.json({ products: [] });
      return;
    }

    const where = {
      archivedAt: null,
      ...(ids ? { id: { in: ids.split(',') } } : {}),
      ...(categoryIds ? { categoryId: { in: categoryIds.split(',') } } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const orderBy =
      sort === 'performance'
        ? [{ salesScore: 'desc' as const }]
        : sort === 'manual'
          ? [{ manualSortWeight: 'asc' as const }]
          : [{ createdAt: 'desc' as const }];

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: { images: true, colors: true, sizes: true, category: true },
    });

    res.json({ products });
  })
);

productsRouter.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json({ categories });
  })
);

// '/:id' kasıtlı olarak dosyanın en altında — '/categories' ve '/sort-order' gibi sabit
// path'lerden SONRA tanımlanmalı, yoksa Express bunları id="categories" gibi yakalar.
productsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: true, colors: true, sizes: true, category: true },
    });
    if (!product) {
      res.status(404).json({ error: 'Ürün bulunamadı' });
      return;
    }
    res.json({ product });
  })
);

const productUpdateSchema = z.object({
  description: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  descriptionAr: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  shortDescriptionEn: z.string().nullable().optional(),
  shortDescriptionAr: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  nameAr: z.string().nullable().optional(),
  lengthLabel: z.string().nullable().optional(),
  fabricInfo: z.string().nullable().optional(),
  fabricInfoEn: z.string().nullable().optional(),
  fabricInfoAr: z.string().nullable().optional(),
  manualSortWeight: z.number().int().nullable().optional(),
  salesScore: z.number().nullable().optional(),
  sizes: z.array(z.string().min(1)).optional(),
});

// Ürün Detay ekranından manuel düzenleme — isim/kod/kategori/renkler tsoft senkronundan
// gelir, salt-okunur kalır (bkz. sync.service.ts upsertProduct). Bedenler tsoft API
// kullanıcısının erişim izni olmadığı için (bkz. types/tsoft.ts) tamamen buradan girilir.
productsRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { sizes, ...rest } = parsed.data;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id: req.params.id }, data: rest });
      if (sizes) {
        await tx.productSize.deleteMany({ where: { productId: req.params.id } });
        if (sizes.length > 0) {
          await tx.productSize.createMany({
            data: sizes.map((label, index) => ({ productId: req.params.id, label, sortOrder: index })),
          });
        }
      }
      return tx.product.findUnique({
        where: { id: req.params.id },
        include: { images: true, colors: true, sizes: true, category: true },
      });
    });

    res.json({ product });
  })
);
