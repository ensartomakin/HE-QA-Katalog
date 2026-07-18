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

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const tokenCacheV3 = new Map<string, { token: string; expiresAt: number }>();

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
    });
    return (data.data ?? []).slice(0, limit);
  }

  async getCategoryProducts(categoryId: string): Promise<{ productCode: string }[]> {
    const full = await this.getCategoryProductsFull(categoryId);
    return full.map((p) => ({ productCode: p.productCode }));
  }

  async getCategoryProductsFull(categoryId: string): Promise<TSoftProduct[]> {
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
      });
      const batch = data.data ?? [];
      results.push(...batch.map((p) => this.mapProduct(p)));
      logger.info(`[getCategoryProductsFull] start=${start} dönen=${batch.length}`);
      if (batch.length < limit) break;
      start += limit;
    }
    logger.info(`[getCategoryProductsFull] kategori=${categoryId} toplam=${results.length}`);
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
        limit: String(BATCH_SIZE),
      });
      results.push(...(data.data ?? []).map((p) => this.mapProduct(p)));
      await sleep(RATE_DELAY);
    }
    return results;
  }

  private _loggedProductKeys = false;

  private mapProduct(p: Record<string, unknown>): TSoftProduct {
    if (!this._loggedProductKeys) {
      this._loggedProductKeys = true;
      logger.info(`[mapProduct] tüm anahtarlar: ${Object.keys(p).join(', ')}`);
    }
    const stock = Number(p.Stock ?? p.stock ?? 0);
    const rawVariants = (p.SubProducts ?? p.Variants ?? p.Details ?? []) as Record<string, unknown>[];
    const variants =
      Array.isArray(rawVariants) && rawVariants.length > 0
        ? rawVariants.map((v) => ({
            variantId: String(v.ProductId ?? v.VariantId ?? v.variantId ?? ''),
            sizeName: String(v.SizeName ?? v.VariantName ?? v.sizeName ?? ''),
            barcode: String(v.Barcode ?? v.barcode ?? ''),
            stock: Number(v.Stock ?? v.stock ?? 0),
            price: Number(v.SellingPrice ?? v.price ?? 0),
          }))
        : [{ variantId: String(p.ProductId ?? ''), sizeName: 'Tek Beden', barcode: String(p.Barcode ?? ''), stock, price: Number(p.SellingPrice ?? 0) }];

    const rawImageUrl = String(p.MainImageUrl ?? p.mainImageUrl ?? p.ImageUrl ?? p.imageUrl ?? p.Image ?? p.image ?? p.Photo ?? p.photo ?? '');

    const listPrice = Number(p.SellingPrice ?? p.sellingPrice ?? 0);
    const discountedPrice = Number(p.DiscountedPrice ?? p.discountedPrice ?? 0);
    const discountRate =
      Number(p.DiscountRate ?? p.discountRate ?? 0) ||
      (listPrice > 0 && discountedPrice > 0 && discountedPrice < listPrice ? Math.round(((listPrice - discountedPrice) / listPrice) * 100) : 0);

    const seoLink = String(p.SeoLink ?? p.seoLink ?? p.SEOLink ?? p.SEOUrl ?? p.SeoUrl ?? p.seoUrl ?? p.Url ?? p.url ?? p.Slug ?? p.slug ?? '');

    // TODO (Faz 0): getCategoryProductsRawSample() ile HE-QA hesabına karşı ham veri incelenip
    // description / fabricInfo / colors / images alanlarının gerçek T-Soft anahtarları netleştirilecek.
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
