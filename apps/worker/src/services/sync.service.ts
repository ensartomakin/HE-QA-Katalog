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

// Yaygın Türkçe renk adları için yaklaşık hex önizleme — kesin bir tsoft renk kodu
// alanı olmadığından (bkz. types/tsoft.ts) bu sadece UI'da nokta/daire önizlemesi içindir.
const COLOR_HEX_MAP: Record<string, string> = {
  siyah: '#1a1a1a', beyaz: '#f5f5f5', kirik_beyaz: '#f2ede1', ekru: '#e8dcc8',
  bej: '#d9c7a3', kahve: '#5a3d2b', kahverengi: '#5a3d2b', taba: '#8a6642',
  gri: '#8c8c8c', antrasit: '#3a3a3a', lacivert: '#1b2a4a', mavi: '#2f5d9c',
  turkuaz: '#2a9d9a', yesil: '#4a5d3a', haki: '#6b6f4a', hardal: '#c9a23a',
  sari: '#e0c341', turuncu: '#d9722c', kirmizi: '#b3312c', bordo: '#5c1f2b',
  pembe: '#d99aa3', mor: '#6b4a7a', gul_kurusu: '#a9707a', vizon: '#9b8b7a',
};

function colorNameToHex(name: string): string | undefined {
  const key = name
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z]+/g, '_')
    .replace(/(^_|_$)/g, '');
  return COLOR_HEX_MAP[key];
}

/**
 * Kategori ağacını senkronize eder — HAFİF işlemdir (yalnızca 229 kategori, ürün
 * çekilmez), Ürün Seçim Paneli'ndeki kategori ağacı seçicisini doldurmak için kullanılır.
 * tsoftCategoryId -> internal Category.id eşlemesini döndürür.
 */
export async function syncCategories(): Promise<Map<string, string>> {
  const client = await getTsoftClient();
  const categories = await client.getCategories();
  const categoryIdMap = new Map<string, string>();

  for (const cat of categories) {
    // Slug'a tsoftCategoryId eklenir — T-Soft'ta aynı/benzer isimli farklı kategoriler
    // olabiliyor (bazılarında baştaki/sondaki boşluklar bile farklılaşıyor), tekilliği
    // isim yerine tsoftCategoryId garanti eder.
    const category = await prisma.category.upsert({
      where: { tsoftCategoryId: cat.categoryId },
      create: { tsoftCategoryId: cat.categoryId, name: cat.name, slug: `${slugify(cat.name)}-${cat.categoryId}` },
      update: { name: cat.name },
    });
    categoryIdMap.set(cat.categoryId, category.id);
  }

  // İkinci geçiş: kategori ağacını (parentId) kur — ilk geçişte tüm kategoriler henüz
  // oluşmadan ebeveyn referansı kurulamıyordu.
  for (const cat of categories) {
    if (!cat.parentCategoryId || cat.parentCategoryId === '0') continue;
    const internalId = categoryIdMap.get(cat.categoryId);
    const parentInternalId = categoryIdMap.get(cat.parentCategoryId);
    if (!internalId || !parentInternalId || internalId === parentInternalId) continue;
    await prisma.category.update({ where: { id: internalId }, data: { parentId: parentInternalId } });
  }

  logger.info(`[syncCategories] ${categories.length} kategori senkronize edildi`);
  return categoryIdMap;
}

async function upsertProduct(p: TSoftProduct, internalCategoryId: string): Promise<string | null> {
  if (!p.productId || !p.productCode) return null;

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
      colorLabel: p.colorLabel ?? null,
      tsoftRelatedIds: p.relatedProductIds ?? [],
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
      colorLabel: p.colorLabel ?? undefined,
      tsoftRelatedIds: p.relatedProductIds ?? undefined,
      sourcePriceTry: listPrice,
      stockStatus: stockStatusFromVariants(p),
      lastSyncedAt: new Date(),
      sourceMissingSince: null,
      missingSyncCount: 0,
      archivedAt: null, // tekrar görüldü — arşivden çıkar
      rawSourcePayload: p as unknown as object,
    },
  });

  // Bedenler: Faz 0 keşfi HE-QA'nın tsoft API kullanıcısının beden/alt varyant
  // modüllerine erişim izni OLMADIĞINI ortaya çıkardı (product/get hiçbir parametre
  // kombinasyonuyla beden kırılımı döndürmüyor; product/getSubProducts, getVariants,
  // getDetail, getStock uçları "erişim yetkiniz yok" hatası veriyor — bkz.
  // types/tsoft.ts). Bu yüzden burada UYDURMA bir "Tek Beden" kaydı YAZILMIYOR —
  // tsoft panelinden API kullanıcısına ilgili modül izni verilene kadar bedenler
  // Ürün Detay ekranından manuel girilecek (açık soru, kullanıcıya iletildi).

  if (p.imageUrl) {
    await prisma.productImage.upsert({
      where: { id: `${product.id}-primary` },
      create: { id: `${product.id}-primary`, productId: product.id, url: p.imageUrl, sourceUrl: p.imageUrl, isPrimary: true, sortOrder: 0 },
      update: { url: p.imageUrl, sourceUrl: p.imageUrl },
    });
  }

  return product.tsoftProductId;
}

/** Faz 0 bulgusu: tsoft'ta renk seçenekleri ayrı ürünler halinde gelir (RelatedProductsIds1
 *  ile birbirine bağlı). Verilen ürünler için bu ilişkiyi kullanarak "renk seçenekleri"
 *  swatch listesini (kardeşlerinin colorLabel'larından) yeniden inşa eder. */
async function syncColorSwatches(tsoftProductIds: string[]): Promise<void> {
  if (tsoftProductIds.length === 0) return;

  const relatedIds = new Set<string>(tsoftProductIds);
  const seedProducts = await prisma.product.findMany({
    where: { tsoftProductId: { in: tsoftProductIds } },
    select: { tsoftRelatedIds: true },
  });
  for (const p of seedProducts) for (const id of p.tsoftRelatedIds) relatedIds.add(id);

  const products = await prisma.product.findMany({
    where: { tsoftProductId: { in: Array.from(relatedIds) } },
    select: { id: true, tsoftProductId: true, colorLabel: true, tsoftRelatedIds: true },
  });
  const byTsoftId = new Map(products.map((p) => [p.tsoftProductId, p]));

  for (const tsoftId of tsoftProductIds) {
    const product = byTsoftId.get(tsoftId);
    if (!product) continue;

    const siblings = product.tsoftRelatedIds
      .filter((id) => id !== product.tsoftProductId)
      .map((id) => byTsoftId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.colorLabel));

    await prisma.productColor.deleteMany({ where: { productId: product.id } });
    if (siblings.length === 0) continue;

    const ownColor = product.colorLabel ? [{ name: product.colorLabel, hexPreview: colorNameToHex(product.colorLabel) }] : [];
    const siblingColors = siblings.map((s) => ({ name: s.colorLabel!, hexPreview: colorNameToHex(s.colorLabel!) }));
    const all = [...ownColor, ...siblingColors].filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);

    await prisma.productColor.createMany({
      data: all.map((c, i) => ({ productId: product.id, name: c.name, hexPreview: c.hexPreview, sortOrder: i })),
    });
  }
}

/**
 * Tek bir kategorinin ürünlerini tsoft'tan anlık çeker ve önbelleğe (Postgres) yazar.
 * Ürün Seçim Paneli'nde bir kategori seçildiğinde çağrılır — "hangi kategoriyi seçtiysem
 * o kategoriye ait ürünleri getir, tüm kataloğu çekip sistemi şişirme" isteğine karşılık
 * gelir (bkz. konuşma). Kategori tsoftCategoryId üzerinden çözülür.
 */
export async function syncCategoryProducts(tsoftCategoryId: string): Promise<{ upserted: number }> {
  const category = await prisma.category.findUnique({ where: { tsoftCategoryId } });
  if (!category) {
    throw new Error(`Kategori bulunamadı: ${tsoftCategoryId}. Önce kategori ağacını senkronize edin.`);
  }

  const client = await getTsoftClient();
  const products = await client.getCategoryProductsFull(tsoftCategoryId);

  const upsertedIds: string[] = [];
  for (const p of products) {
    const id = await upsertProduct(p, category.id);
    if (id) upsertedIds.push(id);
  }

  await syncColorSwatches(upsertedIds);

  logger.info(`[syncCategoryProducts] kategori=${tsoftCategoryId} (${category.name}) upserted=${upsertedIds.length}`);
  return { upserted: upsertedIds.length };
}

/**
 * Satış performansı senkronu — `order/get` siparişlerinden ürün bazlı adet toplanır
 * (bkz. tsoft-client.ts getSalesViaOrders — report/getSalesReport bu hesapta kapalı) ve
 * `Product.salesScore`'a satılan adet olarak yazılır. Ürün Seçim Paneli'ndeki "Performans"
 * sekmesi bu alana göre sıralıyor (bkz. products.routes.ts sort=performance).
 */
export async function syncSalesPerformance(days = 30): Promise<{ updated: number; matched: number }> {
  const client = await getTsoftClient();
  const sales = await client.getSalesReport([], days);

  let matched = 0;
  for (const s of sales) {
    const result = await prisma.product.updateMany({
      where: { code: s.productCode },
      data: { salesScore: s.soldQuantity14Days },
    });
    matched += result.count;
  }

  logger.info(`[syncSalesPerformance] gün=${days} tsoft'tan gelen=${sales.length} eşleşen=${matched}`);
  return { updated: sales.length, matched };
}

/**
 * Tam senkron (tüm kategoriler + tüm ürünler) — manuel tetiklemeli, büyük katalog
 * boyutu nedeniyle uzun sürebilir. Ürün Seçim Paneli artık varsayılan olarak bunu
 * kullanmıyor (kategoriye göre anlık yükleme yapıyor, bkz. syncCategoryProducts),
 * bu fonksiyon "kaynakta silinen ürün" tespiti ve satış performansı gibi kataloğun
 * TAMAMINI gerektiren işlemler için Ayarlar/Senkronizasyon ekranından ayrıca tetiklenir.
 */
export async function runFullSync(): Promise<{ syncRunId: string; upserted: number; missing: number }> {
  const syncRun = await prisma.syncRun.create({
    data: { status: 'RUNNING', method: 'API' },
  });

  try {
    const client = await getTsoftClient();
    const categoryIdMap = await syncCategories();
    const categories = Array.from(categoryIdMap.keys());

    const seenTsoftIds = new Set<string>();
    let upserted = 0;

    for (const tsoftCategoryId of categories) {
      const products = await client.getCategoryProductsFull(tsoftCategoryId);
      const internalCategoryId = categoryIdMap.get(tsoftCategoryId);
      if (!internalCategoryId) continue;

      for (const p of products) {
        const id = await upsertProduct(p, internalCategoryId);
        if (!id) continue;
        seenTsoftIds.add(id);
        upserted++;
      }
    }

    await syncColorSwatches(Array.from(seenTsoftIds));

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
