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

  // --- Faz 0 keşfi tamamlandı (2026-07-18, gerçek HE-QA hesabına karşı) — bulgular: ---
  // • description → T-Soft'un "Details" alanı (zengin HTML açıklama: kumaş, kalıp tablosu,
  //   manken ölçüleri, bakım önerisi). Ayrı bir "ShortDescription" alanı hep boş geldi.
  // • fabricInfo → AYRI BİR ALAN YOK. "Details" HTML'i içine gömülü serbest metin olarak
  //   geçiyor (örn. "%100 Pamuk müslin kumaş", "%82 Poliamid ve %18 Likra"). En iyi çaba
  //   regex'iyle çıkarılıyor (bkz. tsoft-client.ts extractFabricInfo()).
  // • colorLabel → AYRI BİR "renk seçenekleri" listesi YOK. T-Soft'ta HER RENK KENDİ
  //   ProductCode'una sahip AYRI bir üründür (örn. T7806 "...Gri" / T7807 "...Mavi").
  //   Renk adı Additional2 (ve tekrar Additional5, büyük harf) alanında geliyor.
  // • Kardeş renk varyantları → RelatedProductsIds1 alanında virgülle ayrılmış ProductId
  //   listesi olarak geliyor (ModelId bazı ürünlerde "0" kalabildiği için güvenilir değil,
  //   RelatedProductsIds1 daha tutarlı).
  // • Beden (size) kırılımı → ⚠️ BU API KULLANICISIYLA ERİŞİLEMİYOR. `product/get` her
  //   parametre kombinasyonunda (FetchDetails, StockFields, SubProducts=true, ProductCode
  //   filtresi) tek bir düz obje döndürüyor, alt varyant dizisi yok. `product/getDetail`,
  //   `product/getSubProducts`, `product/getVariants`, `product/getStock` uçları
  //   "Bu modüle erişim yetkiniz bulunmamaktadır!" hatası veriyor. `Stock` alanı TÜM
  //   bedenlerin toplamı (bedene göre kırılım yok). Bu bir açık soru olarak kullanıcıya
  //   iletildi — tsoft panelinden API kullanıcısına ilgili modül izni verilmesi gerekiyor.
  description?: string;
  fabricInfo?: string;
  colorLabel?: string;
  relatedProductIds?: string[];
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
