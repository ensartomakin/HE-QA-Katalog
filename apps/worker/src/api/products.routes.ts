import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';

export const productsRouter = Router();

productsRouter.get('/', async (req: Request, res: Response) => {
  const { categoryIds, search, sort } = req.query as { categoryIds?: string; search?: string; sort?: string };

  // Kategori veya arama filtresi olmadan sorgu çalıştırılmaz — "hangi kategoriyi seçtiysem
  // o kategoriye ait ürünleri getir, tüm kataloğu çekip sistemi şişirme" isteği (bkz. konuşma).
  // Kategori seçildiğinde önce POST /api/sync/category/:tsoftCategoryId ile tsoft'tan anlık
  // çekilip önbelleğe yazılır, sonra bu uç noktadan okunur.
  if (!categoryIds && !search) {
    res.json({ products: [] });
    return;
  }

  const where = {
    archivedAt: null,
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
});

productsRouter.get('/categories', async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json({ categories });
});
