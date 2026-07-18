import { prisma } from '../db/prisma';
import { getTsoftClient } from './tsoft-client';
import { logger } from '../utils/logger';
import type { TSoftProduct } from '../types/tsoft';

const MISSING_THRESHOLD = 3; // bu kadar ardışık senkronda görünmeyen ürün arşivlenir (bkz. docs §6)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stockStatusFromVariants(product: TSoftProduct): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  const total = product.variants.reduce((sum, v) => sum + v.stock, 0);
  if (total <= 0) return 'OUT_OF_STOCK';
  if (total < 10) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * Manuel tetiklemeli tam senkron — HE-QA için otomatik/zamanlanmış senkron MVP kapsamında
 * yok (netleşti), bu fonksiyon yalnızca "Şimdi Senkronize Et" isteğiyle çağrılır.
 */
export async function runFullSync(): Promise<{ syncRunId: string; upserted: number; missing: number }> {
  const syncRun = await prisma.syncRun.create({
    data: { status: 'RUNNING', method: 'API' },
  });

  try {
    const client = await getTsoftClient();

    const categories = await client.getCategories();
    const categoryIdMap = new Map<string, string>(); // tsoftCategoryId -> internal Category.id

    for (const cat of categories) {
      const category = await prisma.category.upsert({
        where: { slug: slugify(cat.name) },
        create: { name: cat.name, slug: slugify(cat.name) },
        update: { name: cat.name },
      });
      categoryIdMap.set(cat.categoryId, category.id);
    }

    const seenTsoftIds = new Set<string>();
    let upserted = 0;

    for (const cat of categories) {
      const products = await client.getCategoryProductsFull(cat.categoryId);
      const internalCategoryId = categoryIdMap.get(cat.categoryId);
      if (!internalCategoryId) continue;

      for (const p of products) {
        if (!p.productId || !p.productCode) continue;
        seenTsoftIds.add(p.productId);

        const listPrice = Math.max(...p.variants.map((v) => v.price), 0);

        const product = await prisma.product.upsert({
          where: { tsoftProductId: p.productId },
          create: {
            tsoftProductId: p.productId,
            name: p.productName,
            code: p.productCode,
            categoryId: internalCategoryId,
            description: p.description ?? null,
            fabricInfo: p.fabricInfo ?? null,
            sourcePriceTry: listPrice,
            stockStatus: stockStatusFromVariants(p),
            lastSyncedAt: new Date(),
            sourceMissingSince: null,
            missingSyncCount: 0,
            rawSourcePayload: p as unknown as object,
          },
          update: {
            name: p.productName,
            categoryId: internalCategoryId,
            description: p.description ?? undefined,
            fabricInfo: p.fabricInfo ?? undefined,
            sourcePriceTry: listPrice,
            stockStatus: stockStatusFromVariants(p),
            lastSyncedAt: new Date(),
            sourceMissingSince: null,
            missingSyncCount: 0,
            archivedAt: null, // tekrar görüldü — arşivden çıkar
            rawSourcePayload: p as unknown as object,
          },
        });

        // Bedenler — T-Soft varyantlarından türetilir
        await prisma.productSize.deleteMany({ where: { productId: product.id } });
        if (p.variants.length > 0) {
          await prisma.productSize.createMany({
            data: p.variants.map((v, i) => ({ productId: product.id, label: v.sizeName, sortOrder: i })),
          });
        }

        // Renkler — Faz 0 keşfi tamamlanana kadar boş kalabilir (bkz. types/tsoft.ts TODO)
        if (p.colors && p.colors.length > 0) {
          await prisma.productColor.deleteMany({ where: { productId: product.id } });
          await prisma.productColor.createMany({
            data: p.colors.map((c, i) => ({ productId: product.id, name: c.name, hexPreview: c.hexPreview, sortOrder: i })),
          });
        }

        // Ana görsel
        if (p.imageUrl) {
          await prisma.productImage.upsert({
            where: { id: `${product.id}-primary` },
            create: { id: `${product.id}-primary`, productId: product.id, url: p.imageUrl, sourceUrl: p.imageUrl, isPrimary: true, sortOrder: 0 },
            update: { url: p.imageUrl, sourceUrl: p.imageUrl },
          });
        }

        upserted++;
      }
    }

    // Kaynakta artık görünmeyen ürünler — hard delete YOK, kademeli arşivleme (bkz. docs §6)
    const missingProducts = await prisma.product.findMany({
      where: { tsoftProductId: { notIn: Array.from(seenTsoftIds) }, archivedAt: null },
      select: { id: true, missingSyncCount: true, sourceMissingSince: true },
    });

    for (const mp of missingProducts) {
      const newCount = mp.missingSyncCount + 1;
      await prisma.product.update({
        where: { id: mp.id },
        data: {
          missingSyncCount: newCount,
          sourceMissingSince: mp.sourceMissingSince ?? new Date(),
          archivedAt: newCount >= MISSING_THRESHOLD ? new Date() : null,
        },
      });
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: 'SUCCESS', finishedAt: new Date(), productsUpserted: upserted, productsMissing: missingProducts.length },
    });

    logger.info(`[sync] tamamlandı — upserted=${upserted} missing=${missingProducts.length}`);
    return { syncRunId: syncRun.id, upserted, missing: missingProducts.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncRun.update({ where: { id: syncRun.id }, data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message } });
    logger.error(`[sync] hata: ${message}`);
    throw err;
  }
}
