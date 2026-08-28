import {
  calculatePrice,
  CATALOG_TEMPLATES,
  extractDefiningSentence,
  extractFabricComposition,
  extractFabricMaterialFallback,
  extractDefiningSentenceEn,
  extractFabricCompositionEn,
  extractFabricMaterialFallbackEn,
} from '@he-qa/db';
import { prisma } from '../db/prisma';
import { translateToEnglish } from './translation.service';
import { getTsoftClient } from './tsoft-client';
import { logger } from '../utils/logger';

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
  language: 'TR' | 'AR' | 'EN';
  productIds: string[];
  createdBy: string;
  // Katalog Oluşturucu'daki "artırılabilir" sayfa başlıkları — productId -> bu üründe
  // gösterilecek üst künye metni. Burada olmayan ürünler kataloğun varsayılan başlığını
  // kullanır (bkz. Template.tsx EdRunningHeader, catalog.coverTitle/name fallback'i).
  titleOverrides?: Record<string, string>;
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
      language: input.language,
      createdBy: input.createdBy,
      status: 'DRAFT',
      items: {
        create: input.productIds.map((productId, i) => ({
          productId,
          sortOrder: i,
          headerTitleOverride: input.titleOverrides?.[productId] || null,
        })),
      },
    },
    include: { items: true },
  });
  return catalog;
}

type TranslatableProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  descriptionEn: string | null;
  shortDescription: string | null;
  shortDescriptionEn: string | null;
  nameEn: string | null;
  fabricInfo: string | null;
  fabricInfoEn: string | null;
};

// İngilizce katalog önizleme/PDF üretiminde, editörün elle çevirmediği ürün metinlerini
// önce T-Soft'un kendi "Dil" sekmesinden (bkz. tsoft-client.ts getProductLanguage —
// insan tarafından çevrilmiş, otoriter kaynak) çekmeye çalışır; T-Soft'ta o ürün için
// İngilizce girilmemişse Gemini ile Türkçeden çevirip DB'ye yazar. Sonuç kalıcı olduğundan
// bir sonraki istekte aynı ürün için tekrar çekilmez/çevrilmez. Her adım ayrı try/catch
// ile denenir; biri başarısız olursa diğerleri etkilenmez ve şablon o alan için Türkçe
// metne düşer (bkz. Template.tsx) — sayfa hiçbir zaman boş kalmaz.
const TRANSLATE_CONCURRENCY = 4;

async function fillMissingEnglishContent(items: { product: TranslatableProduct }[]) {
  const pending = items.filter(
    (item) =>
      !item.product.nameEn ||
      (!item.product.descriptionEn && item.product.description) ||
      (!item.product.shortDescriptionEn && (item.product.shortDescription || item.product.description)) ||
      (!item.product.fabricInfoEn && (item.product.fabricInfo || item.product.description))
  );
  if (pending.length === 0) return;

  const tsoft = await getTsoftClient().catch((err) => {
    logger.error(`[catalog/translate] T-Soft istemcisi alınamadı, doğrudan Gemini'ye düşülüyor: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });

  for (let i = 0; i < pending.length; i += TRANSLATE_CONCURRENCY) {
    const batch = pending.slice(i, i + TRANSLATE_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ product }) => {
        const data: Record<string, string> = {};

        // 1) T-Soft'un kendi İngilizce "Dil" sekmesi — editör tarafından girilmiş gerçek
        // çeviri, Gemini'den önce denenir. Boş/hata durumunda sessizce Gemini'ye düşülür.
        let tsoftName = '';
        let tsoftDescription = '';
        let tsoftShort = '';
        if (tsoft && (!product.nameEn || !product.descriptionEn || !product.shortDescriptionEn)) {
          try {
            const lang = await tsoft.getProductLanguage(product.code, 'en');
            if (lang) {
              tsoftName = lang.productName;
              tsoftDescription = lang.description;
              tsoftShort = lang.shortDescription;
            }
          } catch (err) {
            logger.error(`[catalog/translate] ürün ${product.id} T-Soft getProductLanguage: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (!product.nameEn) {
          if (tsoftName) {
            data.nameEn = tsoftName;
          } else if (product.name) {
            try {
              data.nameEn = await translateToEnglish(product.name);
            } catch (err) {
              logger.error(`[catalog/translate] ürün ${product.id} nameEn: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        if (!product.descriptionEn) {
          if (tsoftDescription) {
            data.descriptionEn = tsoftDescription;
          } else if (product.description) {
            try {
              data.descriptionEn = await translateToEnglish(product.description);
            } catch (err) {
              logger.error(`[catalog/translate] ürün ${product.id} descriptionEn: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Sonraki iki alan (kısa açıklama, kumaş), az önce elde edilen İngilizce açıklama
        // üzerinden kural tabanlı çıkarım yapabilmek için descriptionEn'in EN halini bilmeli
        // — DB'de zaten varsa oradan, bu istekte yeni geldiyse data.descriptionEn'den okunur.
        const resolvedDescriptionEn = data.descriptionEn ?? product.descriptionEn;

        if (!product.shortDescriptionEn) {
          let shortEn = tsoftShort || (resolvedDescriptionEn ? extractDefiningSentenceEn(resolvedDescriptionEn) : null);
          if (!shortEn) {
            const trExcerpt = product.shortDescription?.trim() || extractDefiningSentence(product.description) || null;
            if (trExcerpt) {
              try {
                shortEn = await translateToEnglish(trExcerpt);
              } catch (err) {
                logger.error(`[catalog/translate] ürün ${product.id} shortDescriptionEn: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          }
          if (shortEn) data.shortDescriptionEn = shortEn;
        }

        if (!product.fabricInfoEn) {
          const enFabric = resolvedDescriptionEn
            ? extractFabricCompositionEn(resolvedDescriptionEn) ?? extractFabricMaterialFallbackEn(resolvedDescriptionEn)
            : null;
          if (enFabric) {
            data.fabricInfoEn = enFabric;
          } else {
            const trFabric =
              extractFabricComposition(product.description) ?? extractFabricMaterialFallback(product.description) ?? product.fabricInfo;
            if (trFabric) {
              try {
                data.fabricInfoEn = await translateToEnglish(trFabric);
              } catch (err) {
                logger.error(`[catalog/translate] ürün ${product.id} fabricInfoEn: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          }
        }

        if (Object.keys(data).length > 0) {
          await prisma.product.update({ where: { id: product.id }, data });
          Object.assign(product, data);
        }
      })
    );
  }
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

  if (catalog.language === 'EN') {
    await fillMissingEnglishContent(catalog.items);
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
