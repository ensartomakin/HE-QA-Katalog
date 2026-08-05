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
  // • Beden (size) kırılımı → ÇÖZÜLDÜ (2026-08-05, bkz. docs/SISTEM-TASARIMI.md §7.11).
  //   `product/get`'e `FetchSubProducts=true` eklenmeden istek "başarılı" dönüyor ama
  //   `SubProducts` alanı hiç gelmiyordu (yetki sorunu değildi). Bu parametreyle alt ürün
  //   dizisi geliyor: her satırda `Property2` = Nitelik2/Beden değeri (örn. "36"), `Property1`
  //   = Nitelik1/Renk (genelde boş — renk zaten ayrı ProductCode'lu ayrı ürün), `Stock` =
  //   GERÇEK bedene göre stok adedi (üst seviye `Stock` bunların toplamı). `SellingPrice`
  //   alt üründe genelde "0" — fiyat ana ürün seviyesinde tutuluyor, `mapProduct()` bu
  //   durumda ana ürün fiyatına düşüyor. `product/getSubProducts` vb. ayrı uçlar hâlâ
  //   "erişim yetkiniz yok" hatası veriyor ama artık gerekli değil.
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
