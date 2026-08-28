import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { chunk, sleep } from '../utils/helpers';
import { getCredentials, type TsoftCredentials } from '../db/credentials.repo';
import type { TSoftProduct, TSoftSalesData } from '../types/tsoft';
import type { TSoftClientApi } from './tsoft-client-api';

// Rankify projesinde (Desktop/Proje/GitHub/Rankify/src/services/tsoft-client.ts) kanıtlanmış
// T-Soft REST1/V3 client'ının HE-QA'ya uyarlanmış hali. Uyarlama farkları:
//  - Çoklu-tenant/kullanıcı mantığı kaldırıldı (HE-QA tek-tenant, tek rol — netleşti)
//  - product/setCategorySortNumber (kategori sıralama yazma) kaldırıldı — HE-QA katalog
//    sıralamasını kendi `manualSortWeight` alanında tutuyor, T-Soft'a geri yazmıyor
//  - getCategoryProductsSorted (ListNo sezgisel sıralaması) kaldırıldı — sıralama artık
//    HE-QA tarafında (Ürün Seçim Paneli) yönetiliyor

const BATCH_SIZE = 50;
const RATE_DELAY = 500;
const MAX_RETRIES = 3;
const REAUTH_COOLDOWN = 5 * 60 * 1000; // aynı mağaza için zorla yeniden-login arası minimum süre
const CATEGORY_CACHE_TTL = 60 * 60 * 1000; // 1 saat

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const tokenCacheV3 = new Map<string, { token: string; expiresAt: number }>();

// Zorla yeniden-login zaman damgası — cacheKey → son deneme zamanı (auth/login fırtınasını önler;
// bkz. Rankify T-Soft abuse raporu 2026-08-07 — token hatası mesajı her başarısız istekte ayrı
// ayrı yeniden login tetikliyordu)
const lastReauthAt = new Map<string, number>();

// Kategori ürün listesi önbelleği — `${cacheKey}::cat::${categoryId}` → { data, expiresAt }
const categoryProductsCache = new Map<string, { data: TSoftProduct[]; expiresAt: number }>();

async function withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const delay = 1000 * attempt;
    logger.warn(`Retry ${attempt}/${MAX_RETRIES - 1}, ${delay}ms bekleniyor…`);
    await sleep(delay);
    return withRetry(fn, attempt + 1);
  }
}

function usernameForUrl(apiUser: string): string {
  return apiUser.includes('@') ? apiUser.split('@')[0] : apiUser;
}

// REST1 token — query params ile
async function fetchToken(http: AxiosInstance, creds: TsoftCredentials): Promise<string> {
  const username = usernameForUrl(creds.apiUser);
  const endpoint = `/rest1/auth/login/${encodeURIComponent(username)}`;
  logger.info(`[T-Soft Auth] POST ${http.defaults.baseURL}${endpoint}`);

  let res: import('axios').AxiosResponse;
  try {
    res = await http.post(endpoint, null, {
      params: { user: username, pass: creds.apiPass },
    });
  } catch (err) {
    const e = err as AxiosError;
    logger.error(`[T-Soft Auth] HTTP Error ${e.response?.status}: ${JSON.stringify(e.response?.data)}`);
    throw err;
  }

  logger.info(`[T-Soft Auth] Response ${res.status}: ${JSON.stringify(res.data)}`);

  if (!res.data?.success) {
    const textField = res.data?.message?.[0]?.text;
    const msg = Array.isArray(textField) ? textField[0] : (textField ?? 'Kimlik doğrulama başarısız');
    throw new Error(msg);
  }

  return res.data.data[0].token as string;
}

// V3 token — POST /api/v3/admin/auth/login {email, password}
async function fetchTokenV3(http: AxiosInstance, creds: TsoftCredentials): Promise<string> {
  const email = creds.apiUser.includes('@')
    ? creds.apiUser
    : `${creds.apiUser}@${new URL(creds.apiUrl).hostname.replace(/^www\./, '')}`;

  logger.info(`[T-Soft V3 Auth] POST ${http.defaults.baseURL}/api/v3/admin/auth/login email=${email}`);
  try {
    const res = await http.post('/api/v3/admin/auth/login', { email, password: creds.apiPass });
    logger.info(`[T-Soft V3 Auth] Response ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
    const token = res.data?.data?.token ?? res.data?.token ?? res.data?.access_token;
    if (!token) {
      logger.warn(`[T-Soft V3 Auth] Token bulunamadı — response: ${JSON.stringify(res.data)}`);
      throw new Error('V3 token alınamadı');
    }
    return token as string;
  } catch (err) {
    const e = err as AxiosError;
    logger.error(`[T-Soft V3 Auth] Error ${e.response?.status}: ${JSON.stringify(e.response?.data).slice(0, 300)}`);
    throw err;
  }
}

async function getToken(cacheKey: string, http: AxiosInstance, creds: TsoftCredentials): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const token = await fetchToken(http, creds);
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 60 * 60 * 1000 });
  return token;
}

async function getTokenV3(cacheKey: string, http: AxiosInstance, creds: TsoftCredentials): Promise<string> {
  if (creds.apiToken) return creds.apiToken; // kalıcı token varsa 2FA akışını atla
  const cached = tokenCacheV3.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const token = await fetchTokenV3(http, creds);
  tokenCacheV3.set(cacheKey, { token, expiresAt: Date.now() + 60 * 60 * 1000 });
  return token;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/rest1.*$/i, '').replace(/\/api\/v3.*$/i, '').replace(/\/$/, '');
}

export async function testConnection(creds: TsoftCredentials): Promise<{ ok: boolean; message: string; debug?: string }> {
  const baseUrl = normalizeBaseUrl(creds.apiUrl);
  try {
    const http = axios.create({ baseURL: baseUrl, timeout: 15_000, maxRedirects: 5 });
    await fetchToken(http, { ...creds, apiUrl: baseUrl });
    return { ok: true, message: 'Bağlantı başarılı — token alındı' };
  } catch (err) {
    const e = err as AxiosError & { message: string };
    logger.error(`[testConnection] baseUrl=${baseUrl} user=${creds.apiUser} err=${e.message}`);
    if (e.response?.status === 404) {
      return { ok: false, message: "API adresi bulunamadı. URL'yi kontrol edin (örn: https://markaadi.com)", debug: `baseUrl: ${baseUrl}` };
    }
    return {
      ok: false,
      message: e.message ?? 'Bağlantı hatası',
      debug: `baseUrl: ${baseUrl} | endpoint: /rest1/auth/login/${usernameForUrl(creds.apiUser)}`,
    };
  }
}

export class TSoftClient implements TSoftClientApi {
  private http: AxiosInstance;
  private cacheKey: string;
  private creds: TsoftCredentials;

  constructor(creds: TsoftCredentials) {
    const baseUrl = normalizeBaseUrl(creds.apiUrl);
    this.creds = { ...creds, apiUrl: baseUrl };
    this.cacheKey = `${baseUrl}::${creds.apiUser}`;

    this.http = axios.create({ baseURL: baseUrl, timeout: 15_000, maxRedirects: 5 });
    this.http.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        logger.error(`T-Soft [${err.response?.status}] ${err.config?.url}: ${err.message}`);
        return Promise.reject(err);
      }
    );
  }

  private async post<T = unknown>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    const token = await getToken(this.cacheKey, this.http, this.creds);
    const body = new URLSearchParams({ token, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const res = await withRetry(() =>
      this.http.post(`/rest1/${endpoint}`, body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    );
    if (res.data?.success === false) {
      const msgText = res.data?.message?.[0]?.text;
      const msgStr = Array.isArray(msgText) ? String(msgText[0]) : String(msgText ?? '');
      logger.info(`[REST1 ${endpoint}] success=false msg="${msgStr}"`);
      if (msgStr.toLowerCase().includes('token')) {
        const lastAttempt = lastReauthAt.get(this.cacheKey) ?? 0;
        if (Date.now() - lastAttempt < REAUTH_COOLDOWN) {
          logger.warn(`[REST1 ${endpoint}] token hatası ama soğuma süresi dolmadı (${REAUTH_COOLDOWN / 1000}s) — yeniden login denenmiyor`);
          return res.data;
        }
        lastReauthAt.set(this.cacheKey, Date.now());
        tokenCache.delete(this.cacheKey);
        const newToken = await getToken(this.cacheKey, this.http, this.creds);
        const retryBody = new URLSearchParams({ token: newToken, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
        const retry = await this.http.post(`/rest1/${endpoint}`, retryBody, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        return retry.data;
      }
    }
    return res.data;
  }

  // V3 — Bearer token, GET isteği
  async getV3<T = unknown>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    const token = await getTokenV3(this.cacheKey, this.http, this.creds);
    const res = await withRetry(() => this.http.get(`/api/v3/admin/${path}`, { headers: { Authorization: `Bearer ${token}` }, params }));
    return res.data;
  }

  async getCategories(): Promise<{ categoryId: string; name: string; parentCategoryId: string }[]> {
    const data = await this.post<{ success: boolean; data: Record<string, string>[] }>('category/getCategories', { limit: '500' });
    logger.info(`[getCategories] count=${data.data?.length ?? 0}`);
    return (data.data ?? [])
      .map((c) => ({
        categoryId: c.CategoryId ?? c.categoryId ?? '',
        name: c.CategoryName ?? c.categoryName ?? '',
        parentCategoryId: c.ParentCode ?? c.parentCode ?? '0',
      }))
      .filter((c) => c.categoryId);
  }

  /** Faz 0 keşif aracı — ham T-Soft yanıtını olduğu gibi döndürür (kumaş/renk/açıklama/görsel
   *  alan adlarını tespit etmek için kullanılır, bkz. docs/SISTEM-TASARIMI.md §1). */
  async getCategoryProductsRawSample(categoryId: string, limit = 3): Promise<Record<string, unknown>[]> {
    const data = await this.post<{ success: boolean; data: Record<string, unknown>[] }>('product/get', {
      CategoryIds: categoryId,
      start: '0',
      limit: String(limit),
      FetchDetails: 'true',
      StockFields: 'true',
      FetchSubProducts: 'true',
    });
    return (data.data ?? []).slice(0, limit);
  }

  async getCategoryProducts(categoryId: string): Promise<{ productCode: string }[]> {
    const full = await this.getCategoryProductsFull(categoryId);
    return full.map((p) => ({ productCode: p.productCode }));
  }

  async getCategoryProductsFull(categoryId: string): Promise<TSoftProduct[]> {
    const key = `${this.cacheKey}::cat::${categoryId}`;
    const cached = categoryProductsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[getCategoryProductsFull] önbellekten döndü — kategori=${categoryId} toplam=${cached.data.length}`);
      return cached.data;
    }
    const results: TSoftProduct[] = [];
    let start = 0;
    const limit = 500;
    while (true) {
      const data = await this.post<{ success: boolean; data: Record<string, unknown>[] }>('product/get', {
        CategoryIds: categoryId,
        start: String(start),
        limit: String(limit),
        FetchDetails: 'true',
        StockFields: 'true',
        FetchSubProducts: 'true',
      });
      const batch = data.data ?? [];
      results.push(...batch.map((p) => this.mapProduct(p)));
      logger.info(`[getCategoryProductsFull] start=${start} dönen=${batch.length}`);
      if (batch.length < limit) break;
      start += limit;
    }
    logger.info(`[getCategoryProductsFull] kategori=${categoryId} toplam=${results.length}`);
    categoryProductsCache.set(key, { data: results, expiresAt: Date.now() + CATEGORY_CACHE_TTL });
    return results;
  }

  async getProductDetails(productCodes: string[]): Promise<TSoftProduct[]> {
    const results: TSoftProduct[] = [];
    for (const [i, batch] of chunk(productCodes, BATCH_SIZE).entries()) {
      logger.info(`Ürün detayı batch ${i + 1} (${batch.length} ürün)`);
      const data = await this.post<{ data: Record<string, unknown>[] }>('product/get', {
        ProductCode: batch.join('|'),
        FetchDetails: 'true',
        StockFields: 'true',
        FetchSubProducts: 'true',
        limit: String(BATCH_SIZE),
      });
      results.push(...(data.data ?? []).map((p) => this.mapProduct(p)));
      await sleep(RATE_DELAY);
    }
    return results;
  }

  /** T-Soft ürün düzenleme ekranındaki "Dil" sekmesinin çoklu-dil içeriğini döndürür
   *  (bkz. T-Soft destek yanıtı: `product/getProductLanguage/{ProductCode}`, gövdede
   *  `Language=en` parametresiyle). Bu, `product/get`'in normal yanıtından TAMAMEN AYRI bir
   *  uç nokta — dil parametresi login'de veya `product/get`'te değil, sadece burada işe
   *  yarıyor (birçok varyant denendi, bkz. PR #71 tartışması). Editör o ürün için İngilizce
   *  sekmesini hiç doldurmadıysa alanlar boş string döner (null değil) — bu yüzden trim
   *  edip boşsa null'a çeviriyoruz ki çağıran taraf (catalog.service.ts) "T-Soft'ta yok,
   *  Gemini'ye düş" kararını güvenle verebilsin. */
  async getProductLanguage(productCode: string, language: string): Promise<{ productName: string; description: string; shortDescription: string } | null> {
    const token = await getToken(this.cacheKey, this.http, this.creds);
    const body = new URLSearchParams({ token, Language: language });
    const res = await withRetry(() =>
      this.http.post(`/rest1/product/getProductLanguage/${encodeURIComponent(productCode)}`, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    if (res.data?.success === false) return null;
    const d = res.data?.data as Record<string, unknown> | undefined;
    if (!d) return null;

    const productName = String(d.ProductName ?? '').trim();
    const detailsHtml = String(d.Details ?? '').trim();
    const shortDescription = String(d.ShortDescription ?? '').trim();
    if (!productName && !detailsHtml && !shortDescription) return null;

    return {
      productName,
      description: detailsHtml ? this.stripHtml(detailsHtml) : '',
      shortDescription: shortDescription ? this.stripHtml(shortDescription) : '',
    };
  }

  private _loggedProductKeys = false;

  /** Details HTML'inden düz metin çıkarır (etiketleri söker, boşlukları sadeleştirir). */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Faz 0 keşfinde görüldüğü üzere kumaş bilgisi ayrı bir alan değil, Details HTML'inin
   *  içine gömülü serbest metin. "%NN ... kumaş/karışım" örüntüsünü en iyi çaba ile yakalar;
   *  bulunamazsa null döner (admin panelden manuel girilebilir). */
  private extractFabricInfo(detailsText: string): string | undefined {
    const match = detailsText.match(/%\d+[^.]*?(kumaş|karışım|likra|elastan|pamuk|polyester|poliamid)[^.]*\./i);
    return match ? match[0].trim() : undefined;
  }

  private mapProduct(p: Record<string, unknown>): TSoftProduct {
    if (!this._loggedProductKeys) {
      this._loggedProductKeys = true;
      logger.info(`[mapProduct] tüm anahtarlar: ${Object.keys(p).join(', ')}`);
    }
    const stock = Number(p.Stock ?? p.stock ?? 0);
    // Faz 0.6 keşfi (2026-08-07): `SellingPrice` KDV HARİÇ liste fiyatı — mağaza sitesinde
    // müşteriye hiç gösterilmiyor. Canlı siteyle karşılaştırıldı (T6766, Kuşaklı Uzun
    // Trençkot Kemik): SellingPrice=2945.36 ama sitede üstü çizili gösterilen gerçek
    // indirimsiz fiyat 3239.90 TL — bu da `SellingPriceVatIncludedNoDiscount` alanına
    // (KDV DAHİL, tsoft'un kendi indirimi UYGULANMADAN) birebir eşleşiyor. Toptan fiyat
    // hesaplaması (bkz. sync.service.ts → calculatePrice) bu KDV dahil indirimsiz fiyat
    // üzerinden yapılmalı — tsoft'un kendi aktif indirimi (DiscountedPrice/
    // SellingPriceVatIncluded, örn. %10) burada KASITLI olarak yok sayılıyor, bizim
    // toptan indirimimiz (örn. %40) her zaman TAM liste fiyatı üzerinden hesaplanır.
    const parentPrice = Number(p.SellingPriceVatIncludedNoDiscount ?? p.sellingPriceVatIncludedNoDiscount ?? p.SellingPrice ?? p.sellingPrice ?? 0);

    // Faz 0.5 keşfi (2026-08-05): beden kırılımı `product/get`'e `FetchSubProducts=true`
    // gönderildiğinde `SubProducts` alanında geliyor — bu parametre olmadan istek "başarılı"
    // dönüyor ama alan hiç yer almıyor (Faz 0'da bu yüzden gözden kaçmıştı). Alt ürün
    // satırlarında beden değeri `Property2`'de (VariantFeature2Title = "Beden"), renk ise
    // `Property1`'de geliyor — ama renk zaten ayrı ProductCode'lu ayrı bir üründür, bu yüzden
    // burada kullanılmıyor. Alt ürünlerin kendi `SellingPrice`'ı çoğunlukla "0" (fiyat ana
    // ürün seviyesinde tutuluyor) — bu yüzden 0 ise ana ürün fiyatına düşülüyor.
    const rawVariants = (p.SubProducts ?? p.Variants ?? []) as Record<string, unknown>[];
    const variants =
      Array.isArray(rawVariants) && rawVariants.length > 0
        ? rawVariants.map((v) => ({
            variantId: String(v.SubProductId ?? v.ProductId ?? v.VariantId ?? v.variantId ?? ''),
            sizeName: String(v.Property2 || v.Property1 || v.SizeName || v.VariantName || v.sizeName || ''),
            barcode: String(v.Barcode ?? v.barcode ?? ''),
            stock: Number(v.Stock ?? v.stock ?? 0),
            price: Number(v.SellingPrice ?? v.price ?? 0) || parentPrice,
          }))
        : [{ variantId: String(p.ProductId ?? ''), sizeName: 'Tek Beden', barcode: String(p.Barcode ?? ''), stock, price: parentPrice }];

    // Faz 0 keşfi: T-Soft "ImageUrl" alanı sadece dosya adı döndürüyor (tam URL değil).
    // Gerçek erişilebilir adres mağaza domaininin köküne dosya adının eklenmesiyle oluşuyor
    // (örn. "48931-32-K.jpg" → "https://www.he-qa.com/48931-32-K.jpg" — doğrulandı).
    const rawImageFilename = String(p.MainImageUrl ?? p.mainImageUrl ?? p.ImageUrl ?? p.imageUrl ?? p.Image ?? p.image ?? p.Photo ?? p.photo ?? '');
    const rawImageUrl = rawImageFilename && !rawImageFilename.startsWith('http')
      ? `${this.creds.apiUrl}/${rawImageFilename}`
      : rawImageFilename;

    // discountRate burada yalnızca bilgi amaçlı — tsoft'un KENDİ aktif indirimini yansıtır,
    // bizim toptan fiyat hesaplamamızda (parentPrice her zaman indirimsiz) kullanılmaz.
    const discountedPrice = Number(p.SellingPriceVatIncluded ?? p.sellingPriceVatIncluded ?? p.DiscountedPrice ?? p.discountedPrice ?? 0);
    const discountRate =
      Number(p.DiscountRate ?? p.discountRate ?? 0) ||
      (parentPrice > 0 && discountedPrice > 0 && discountedPrice < parentPrice ? Math.round(((parentPrice - discountedPrice) / parentPrice) * 100) : 0);

    const seoLink = String(p.SeoLink ?? p.seoLink ?? p.SEOLink ?? p.SEOUrl ?? p.SeoUrl ?? p.seoUrl ?? p.Url ?? p.url ?? p.Slug ?? p.slug ?? '');

    // Faz 0 keşfi (bkz. types/tsoft.ts) — Details HTML'den açıklama + kumaş bilgisi türetilir,
    // renk Additional2/5'ten, kardeş renk varyantları RelatedProductsIds1'den okunur.
    const detailsHtml = String(p.Details ?? '');
    const detailsText = detailsHtml ? this.stripHtml(detailsHtml) : undefined;
    // Additional2/5 bazı ürünlerde ham HTML taşıyor (örn. "<p>Kırmızı</p>") — bu
    // temizlenmezse hem gösterimde hem renk→hex eşlemesinde ("Kırmızı" değil
    // "pkirmizip" gibi bir token) hatalı sonuca yol açıyordu.
    const rawColorLabel = String(p.Additional2 ?? p.Additional5 ?? '').trim();
    const colorLabel = (rawColorLabel.includes('<') ? this.stripHtml(rawColorLabel) : rawColorLabel) || undefined;
    const relatedProductIds = String(p.RelatedProductsIds1 ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return {
      productId: String(p.ProductId ?? p.productId ?? p.Id ?? p.id ?? ''),
      productCode: String(p.ProductCode ?? p.productCode ?? ''),
      productName: String(p.ProductName ?? p.productName ?? ''),
      categoryId: String(p.DefaultCategoryId ?? p.CategoryId ?? p.categoryId ?? ''),
      categoryPath: String(p.DefaultCategoryPath ?? p.categoryPath ?? ''),
      registrationDate: String(p.CreateDate ?? p.RegistrationDate ?? p.registrationDate ?? new Date().toISOString()),
      imageCount: Number(p.ImageCount ?? p.imageCount ?? p.ImageFilesCount ?? p.imageFilesCount ?? 0),
      imageUrl: rawImageUrl,
      sortOrder: Number(p.SortOrder ?? p.sortOrder ?? p.ListNo ?? p.listNo ?? p.Sequence ?? p.sequence ?? p.DisplayOrder ?? p.displayOrder ?? p.SortNo ?? p.sortNo ?? 0),
      reviewCount: Number(p.ReviewCount ?? p.reviewCount ?? p.CommentCount ?? p.commentCount ?? 0),
      variants,
      discountRate,
      seoUrl: seoLink,
      description: detailsText,
      fabricInfo: detailsText ? this.extractFabricInfo(detailsText) : undefined,
      colorLabel,
      relatedProductIds,
    };
  }

  /** report/getSalesReport bu hesaplarda genelde kapalı olabiliyor (Rankify'de "Controller is
   *  not allowed!" hatası alınmıştı); bu yüzden order/get siparişlerinden ürün bazlı adet/ciro
   *  toplanarak satış performansı hesaplanıyor. */
  async getSalesReport(_productCodes: string[], days: number): Promise<TSoftSalesData[]> {
    return this.getSalesViaOrders(days);
  }

  private async getSalesViaOrders(days: number): Promise<TSoftSalesData[]> {
    const endDt = new Date();
    const startDt = new Date(Date.now() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

    logger.info(`[salesOrders] ${fmt(startDt)} → ${fmt(endDt)}`);

    const salesMap = new Map<string, { qty: number; revenue: number }>();
    let start = 0;
    const limit = 200;

    while (true) {
      const raw = await this.post<unknown>('order/get', {
        OrderDateTimeStart: fmt(startDt),
        OrderDateTimeEnd: fmt(endDt),
        FetchProductData: 'true',
        start: String(start),
        limit: String(limit),
      });

      const orders = this.extractRows(raw);

      for (const order of orders) {
        const items = this.extractOrderProducts(order);
        for (const item of items) {
          const code = String(item.ProductCode ?? item.productCode ?? item.Code ?? item.code ?? '');
          if (!code) continue;
          const qty = Number(item.Quantity ?? item.quantity ?? item.Piece ?? item.piece ?? item.Count ?? 1);
          const revenue = Number(item.TotalPrice ?? item.totalPrice ?? item.Price ?? item.price ?? 0);
          const prev = salesMap.get(code) ?? { qty: 0, revenue: 0 };
          salesMap.set(code, { qty: prev.qty + qty, revenue: prev.revenue + revenue });
        }
      }

      logger.info(`[salesOrders] start=${start} dönen=${orders.length}`);
      if (orders.length < limit) break;
      start += limit;
      await sleep(RATE_DELAY);
    }

    const results: TSoftSalesData[] = Array.from(salesMap.entries()).map(([code, s]) => ({
      productCode: code,
      soldQuantity14Days: s.qty,
      revenue14Days: s.revenue,
    }));

    logger.info(`[salesOrders] tamamlandı — ${results.length} ürün, ${results.filter((r) => r.soldQuantity14Days > 0).length} satışlı`);
    return results;
  }

  private extractOrderProducts(order: Record<string, unknown>): Record<string, unknown>[] {
    const candidates = [
      order.OrderDetails, order.orderDetails, // T-Soft REST1 — gerçek alan adı
      order.Products, order.products,
      order.OrderProducts, order.orderProducts,
      order.Items, order.items,
      order.Lines, order.lines,
      order.Details, order.details,
      order.OrderLines, order.orderLines,
      order.ProductList, order.productList,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as Record<string, unknown>[];
    }
    return [];
  }

  /** T-Soft'un farklı yanıt formatlarından satır dizisini çıkarır */
  private extractRows(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) return raw as Record<string, unknown>[];
    if (typeof raw !== 'object' || raw === null) return [];
    const d = raw as Record<string, unknown>;
    const inner = d.data ?? d.Data ?? d.result ?? d.Result;
    if (Array.isArray(inner)) return inner as Record<string, unknown>[];
    if (typeof inner === 'object' && inner !== null) return Object.values(inner) as Record<string, unknown>[];
    const vals = Object.values(d);
    if (vals.length > 0 && vals.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
      return vals as Record<string, unknown>[];
    }
    return [];
  }

  getBaseUrl(): string {
    return this.creds.apiUrl;
  }

  /** HE-QA sıralamayı kendi `manualSortWeight` alanında tutuyor — T-Soft'a geri yazma yok. */
  async setKategoriSira(): Promise<void> {
    throw new Error('setKategoriSira HE-QA için kullanılmıyor — sıralama manualSortWeight ile yönetiliyor');
  }
}

let cachedClient: TSoftClient | null = null;

/** Tek-tenant client factory — kimlik bilgileri singleton `TsoftCredential` satırından okunur. */
export async function getTsoftClient(): Promise<TSoftClientApi> {
  if (cachedClient) return cachedClient;
  const creds = await getCredentials();
  if (!creds) throw new Error('T-Soft bağlantı bilgileri tanımlı değil. Lütfen Ayarlar sayfasından ekleyin.');
  cachedClient = new TSoftClient(creds);
  return cachedClient;
}

/** Kimlik bilgileri Ayarlar ekranından güncellendiğinde cache'lenmiş client'ı sıfırlar. */
export function resetTsoftClientCache(): void {
  cachedClient = null;
}
