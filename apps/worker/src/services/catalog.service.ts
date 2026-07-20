import { calculatePrice } from '@he-qa/db';
import { prisma } from '../db/prisma';

export interface CreateCatalogInput {
  name: string;
  coverTitle?: string;
  coverSubtitle?: string;
  currency: 'TRY' | 'USD' | 'EUR';
  productIds: string[];
  createdBy: string;
}

export async function createCatalog(input: CreateCatalogInput) {
  const catalog = await prisma.catalog.create({
    data: {
      name: input.name,
      currency: input.currency,
      coverTitle: input.coverTitle,
      coverSubtitle: input.coverSubtitle,
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

async function getExchangeRate(currency: 'TRY' | 'USD' | 'EUR'): Promise<number> {
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

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const discountPct = settings ? Number(settings.wholesaleDiscountPct) : 40;
  const ratePerTry = await getExchangeRate(catalog.currency);

  const items = catalog.items.map((item) => {
    const { wholesaleTry, displayPrice } = calculatePrice({
      sourcePriceTry: Number(item.product.sourcePriceTry),
      discountPct,
      ratePerTry,
    });
    return { ...item, priceTry: wholesaleTry, priceDisplay: displayPrice };
  });

  return { ...catalog, items, discountPct };
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
