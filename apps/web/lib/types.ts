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
  fabricInfo: string | null;
  sourcePriceTry: string; // Prisma Decimal → JSON'da string olarak gelir
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  images: ProductImage[];
  colors: ProductColor[];
  sizes: ProductSize[];
}

export type CatalogCurrency = 'TRY' | 'USD' | 'EUR';
export type CatalogStatus = 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED';

export interface CatalogItem {
  id: string;
  productId: string;
  sortOrder: number;
  product: Product;
  priceTry: number;
  priceDisplay: number;
}

export interface CatalogDetail {
  id: string;
  name: string;
  currency: CatalogCurrency;
  coverTitle: string | null;
  coverSubtitle: string | null;
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
