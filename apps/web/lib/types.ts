export interface Category {
  id: string;
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
