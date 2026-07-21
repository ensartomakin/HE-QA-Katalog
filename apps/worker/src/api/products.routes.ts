import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { asyncHandler } from '../utils/async-handler';

export const productsRouter = Router();

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
