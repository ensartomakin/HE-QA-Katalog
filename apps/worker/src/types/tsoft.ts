export interface TSoftVariant {
  variantId: string;
  sizeName: string;
  barcode: string;
  stock: number;
  price: number;
}

export interface TSoftProduct {
  productId: string; // numeric DB id — görsel URL'lerinde kullanılıyor
  productCode: string;
  productName: string;
  categoryId: string;
  categoryPath: string;
  registrationDate: string;
  imageCount: number;
  imageUrl: string; // T-Soft tek görsel döndürüyorsa
  sortOrder: number;
  reviewCount: number;
  variants: TSoftVariant[];
  discountRate: number; // 0-100
  seoUrl: string;

  // --- HE-QA katalog ihtiyaçları için genişletilecek alanlar ---
  // Rankify'nin mapProduct() fonksiyonu bu alanları map'lemiyor (sıralama amaçlı kurulmuştu).
  // Faz 0'da getCategoryProductsRawSample() ile ham T-Soft yanıtı incelenip gerçek anahtar
  // adları (Description/Detail, Properties/Features, renk listesi, görsel galerisi) netleşince
  // mapProduct() burada tanımlı alanları dolduracak şekilde genişletilecek.
  description?: string;
  fabricInfo?: string;
  colors?: { name: string; hexPreview?: string }[];
  images?: string[];
}

export interface TSoftSalesData {
  productCode: string;
  soldQuantity14Days: number;
  revenue14Days: number;
}

export interface TSoftRankPayload {
  productCode: string;
  categoryId: string;
  sortOrder: number;
}
