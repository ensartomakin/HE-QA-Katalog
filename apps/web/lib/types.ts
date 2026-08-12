export interface Category {
  id: string;
  tsoftCategoryId: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  isPrimary: boolean;
}

export interface ProductColor {
  id: string;
  name: string;
  hexPreview: string | null;
}

export interface ProductSize {
  id: string;
  label: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  category: Category;
  description: string | null;
  descriptionEn: string | null;
  nameEn: string | null;
  lengthLabel: string | null;
  fabricInfo: string | null;
  colorLabel: string | null;
  sourcePriceTry: string; // Prisma Decimal → JSON'da string olarak gelir
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  manualSortWeight: number | null;
  salesScore: string | null; // Prisma Decimal → JSON'da string olarak gelir
  images: ProductImage[];
  colors: ProductColor[];
  sizes: ProductSize[];
}

export type CatalogCurrency = 'TRY' | 'USD' | 'EUR';
export type CatalogStatus = 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED';

export interface CatalogItemColorVariant {
  colorLabel: string;
  imageUrl: string | null;
}

export interface FocalPoint {
  x: number;
  y: number;
}

export interface CatalogItem {
  id: string;
  productId: string;
  sortOrder: number;
  product: Product;
  priceTry: number;
  priceDisplay: number;
  originalPriceDisplay: number;
  colorVariants: CatalogItemColorVariant[];
  // Görsel URL'sine göre anahtarlanmış odak noktası (0-1 oran) — bkz. catalog.service.ts
  // updateCatalogItemFocalPoint. Ayarlanmamış görseller bu map'te yer almaz.
  imageFocalPoints: Record<string, FocalPoint> | null;
}

export interface CatalogDetail {
  id: string;
  name: string;
  currency: CatalogCurrency;
  coverTitle: string | null;
  coverSubtitle: string | null;
  coverImageUrl: string | null;
  templateId: string;
  status: CatalogStatus;
  pdfUrl: string | null;
  generatedAt: string | null;
  createdAt: string;
  discountPct: number;
  items: CatalogItem[];
}

export interface CatalogSummary {
  id: string;
  name: string;
  currency: CatalogCurrency;
  status: CatalogStatus;
  pdfUrl: string | null;
  generatedAt: string | null;
  createdAt: string;
  _count: { items: number };
}
