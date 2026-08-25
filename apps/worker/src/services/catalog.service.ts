import { calculatePrice, CATALOG_TEMPLATES } from '@he-qa/db';
import { prisma } from '../db/prisma';
import { generateShortDescription } from './short-description.service';
import { logger } from '../utils/logger';

// Editoryal şablonu ürün açıklaması yerine ~20 kelimelik shortDescription gösteriyor
// (bkz. Template.tsx). Eskiden bu, Ürün Detay ekranından elle tetiklenen bir adımdı;
// artık katalog önizleme/PDF üretiminde eksik olanlar burada otomatik dolduruluyor ve
// DB'ye YAZILIYOR — bir sonraki önizlemede aynı ürün için tekrar üretilmiyor. Yalnızca
// editoryal şablonu bu alanı kullandığından, diğer şablonlarda gereksiz AI çağrısı
// yapılmaması için templateId kontrolüyle sınırlandı.
const SHORT_DESCRIPTION_CONCURRENCY = 4;

async function fillMissingShortDescriptions(items: { product: { id: string; description: string | null; shortDescription: string | null } }[]) {
  const pending = items.filter((item) => !item.product.shortDescription && item.product.description);
  for (let i = 0; i < pending.length; i += SHORT_DESCRIPTION_CONCURRENCY) {
    const batch = pending.slice(i, i + SHORT_DESCRIPTION_CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const shortDescription = await generateShortDescription(item.product.description as string);
          await prisma.product.update({ where: { id: item.product.id }, data: { shortDescription } });
          item.product.shortDescription = shortDescription;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`[catalog/short-description] ürün ${item.product.id}: ${message}`);
        }
      })
    );
  }
}

// variantOrder boşsa ya da colorLabel içinde yoksa tüm bu tür öğeler aynı index'i alır;
// Array.sort stabil olduğundan bu durumda tsoft'tan gelen ham sıra korunur (bkz. getCatalogDetail).
function orderIndex(order: string[], colorLabel: string): number {
  const idx = order.indexOf(colorLabel);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export interface CreateCatalogInput {
  name: string;
  coverTitle?: string;
  coverSubtitle?: string;
  currency: 'TRY' | 'USD' | 'EUR';
  templateId: string;
  productIds: string[];
  createdBy: string;
}

export async function createCatalog(input: CreateCatalogInput) {
  // Kur eksikse katalog oluşturma anında engelle — önceden bu kontrol yalnızca önizleme/PDF
  // üretiminde (getCatalogDetail) yapılıyordu, kullanıcı katalog kaydedildikten SONRA
  // opak bir hatayla karşılaşıyordu.
  await getExchangeRate(input.currency);

  const catalog = await prisma.catalog.create({
    data: {
      name: input.name,
      currency: input.currency,
      coverTitle: input.coverTitle,
      coverSubtitle: input.coverSubtitle,
      templateId: input.templateId,
      createdBy: input.createdBy,
      status: 'DRAFT',
      items: {
        create: input.productIds.map((productId, i) => ({ productId, sortOrder: i })),
      },
    },
    include: { items: true },
  });
  return catalog;
}

export async function listCatalogs() {
  return prisma.catalog.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function getExchangeRate(currency: 'TRY' | 'USD' | 'EUR'): Promise<number> {
  if (currency === 'TRY') return 1;
  const rate = await prisma.exchangeRate.findFirst({ where: { currency }, orderBy: { effectiveAt: 'desc' } });
  if (!rate) throw new Error(`${currency} için kur tanımlı değil. Lütfen Ayarlar'dan kur girin.`);
  return Number(rate.ratePerTry);
}

/** Katalog + sıralı ürünler + o katalog para birimine göre HESAPLANMIŞ fiyatlar.
 *  Hem Katalog Oluşturucu önizlemesi hem PDF şablonu bu fonksiyonu kullanır — tek
 *  doğruluk kaynağı (bkz. docs/SISTEM-TASARIMI.md §2, §6). */
export async function getCatalogDetail(id: string) {
  const catalog = await prisma.catalog.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { product: { include: { images: true, colors: true, sizes: true, category: true } } },
      },
    },
  });
  if (!catalog) return null;

  if (catalog.templateId === 'editoryal') {
    await fillMissingShortDescriptions(catalog.items);
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const discountPct = settings ? Number(settings.wholesaleDiscountPct) : 40;
  const ratePerTry = await getExchangeRate(catalog.currency);

  // Renk varyantı fotoğrafları: tsoft'ta her renk ayrı bir üründür, birbirine tsoftRelatedIds
  // ile bağlıdır (bkz. sync.service.ts syncColorSwatches). Kardeş ürünlerin birincil
  // görselini tek seferde toplu sorguyla çekip her katalog kalemine eşliyoruz.
  const relatedTsoftIds = new Set<string>();
  for (const item of catalog.items) {
    relatedTsoftIds.add(item.product.tsoftProductId);
    for (const rid of item.product.tsoftRelatedIds) relatedTsoftIds.add(rid);
  }
  const variantProducts = await prisma.product.findMany({
    where: { tsoftProductId: { in: Array.from(relatedTsoftIds) } },
    select: { tsoftProductId: true, colorLabel: true, images: { where: { isPrimary: true }, take: 1 } },
  });
  const variantByTsoftId = new Map(variantProducts.map((p) => [p.tsoftProductId, p]));

  const items = catalog.items.map((item) => {
    const { wholesaleTry, displayPrice } = calculatePrice({
      sourcePriceTry: Number(item.product.sourcePriceTry),
      discountPct,
      ratePerTry,
    });
    // İndirimsiz (üstü çizili gösterilecek) liste fiyatı — aynı TRY→hedef para birimi
    // çevrimi, yalnızca indirim uygulanmadan (bkz. calculatePrice).
    const originalPriceDisplay = Math.round((Number(item.product.sourcePriceTry) / ratePerTry + Number.EPSILON) * 100) / 100;

    const variantTsoftIds = [item.product.tsoftProductId, ...item.product.tsoftRelatedIds];
    const colorVariants = variantTsoftIds
      .map((tid) => variantByTsoftId.get(tid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.colorLabel))
      .map((p) => ({ colorLabel: p.colorLabel as string, imageUrl: p.images[0]?.url ?? null }))
      .filter((c, i, arr) => arr.findIndex((x) => x.colorLabel === c.colorLabel) === i)
      .sort((a, b) => orderIndex(item.variantOrder, a.colorLabel) - orderIndex(item.variantOrder, b.colorLabel));

    return { ...item, priceTry: wholesaleTry, priceDisplay: displayPrice, originalPriceDisplay, colorVariants };
  });

  return { ...catalog, items, discountPct };
}

/** PDF üretiminde (pdf.service.ts) sayfa boyutunu (dikey/yatay) belirlemek için kullanılır. */
export async function getCatalogOrientation(id: string): Promise<'portrait' | 'landscape'> {
  const catalog = await prisma.catalog.findUnique({ where: { id }, select: { templateId: true } });
  const template = CATALOG_TEMPLATES.find((t) => t.id === catalog?.templateId);
  return template?.orientation ?? 'portrait';
}

export async function updateCatalogCoverImage(id: string, coverImageUrl: string | null) {
  return prisma.catalog.update({ where: { id }, data: { coverImageUrl } });
}

/** Önizleme ekranındaki sürükle-bırak sonrası çağrılır — verilen sırayla catalogItem.sortOrder'ı
 *  0, 1, 2… olarak yazar (getCatalogDetail bu alana göre sıralıyor). itemIds bu kataloga ait
 *  olmayan bir id içeriyorsa (count uyuşmazlığı) işlem hiç yapılmaz. */
export async function updateCatalogItemsOrder(catalogId: string, itemIds: string[]) {
  const count = await prisma.catalogItem.count({ where: { catalogId, id: { in: itemIds } } });
  if (count !== itemIds.length) throw new Error('Sıralama listesi bu kataloğa ait ürünlerle eşleşmiyor');

  await prisma.$transaction(
    itemIds.map((id, index) => prisma.catalogItem.update({ where: { id }, data: { sortOrder: index } }))
  );
}

/** Önizlemedeki varyant galerisi sürükle-bırak sonrası çağrılır — verilen colorLabel sırasını
 *  kalemin variantOrder alanına yazar (getCatalogDetail bu sırayla colorVariants'ı diziyor).
 *  itemId bu kataloğa ait değilse işlem yapılmaz. colorLabels, o kalemin mevcut colorVariants
 *  listesindeki etiketlerle bire bir eşleşmek zorunda değil — getCatalogDetail zaten eşleşmeyen
 *  etiketleri yok sayıp ham sırayı koruyor, bu yüzden burada ekstra doğrulama yapılmıyor.*/
export async function updateCatalogItemVariantOrder(catalogId: string, itemId: string, colorLabels: string[]) {
  const item = await prisma.catalogItem.findFirst({ where: { id: itemId, catalogId } });
  if (!item) throw new Error('Bu ürün bu kataloğa ait değil');

  await prisma.catalogItem.update({ where: { id: itemId }, data: { variantOrder: colorLabels } });
}

/** Önizlemedeki odak noktası düzenleyicisinden çağrılır — verilen görsel URL'si için
 *  x/y (0-1 oran) değerini kalemin imageFocalPoints JSON alanına yazar (diğer görsellerin
 *  odak noktalarını korur). itemId bu kataloğa ait değilse işlem yapılmaz. */
export async function updateCatalogItemFocalPoint(
  catalogId: string,
  itemId: string,
  imageUrl: string,
  x: number,
  y: number
) {
  const item = await prisma.catalogItem.findFirst({ where: { id: itemId, catalogId } });
  if (!item) throw new Error('Bu ürün bu kataloğa ait değil');

  const existing = (item.imageFocalPoints as Record<string, { x: number; y: number }> | null) ?? {};
  const next = { ...existing, [imageUrl]: { x, y } };

  await prisma.catalogItem.update({ where: { id: itemId }, data: { imageFocalPoints: next } });
}

export async function markCatalogGenerating(id: string) {
  await prisma.catalog.update({ where: { id }, data: { status: 'GENERATING' } });
}

export async function markCatalogReady(id: string, pdfUrl: string) {
  await prisma.catalog.update({ where: { id }, data: { status: 'READY', pdfUrl, generatedAt: new Date() } });
}

export async function markCatalogFailed(id: string) {
  await prisma.catalog.update({ where: { id }, data: { status: 'FAILED' } });
}
