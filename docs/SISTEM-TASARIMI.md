# HE-QA Toptan Katalog Yönetim Sistemi — Teknik Tasarım Dokümanı

> Girdi: `HE-QA-Katalog-Uygulama-Promptu.md` (RTCS-G brief) + `DESIGN (3).md` (Misuko/Spécialiste Belge stil referansı) + iki adet örnek katalog görseli (kapak/içindekiler sayfası, ürün grid sayfaları).

---

## 0. Tasarım Referanslarının Uzlaştırılması (önemli ön not)

İki görsel ile `DESIGN (3).md` dokümanı **aynı sistemi değil, iki farklı katmanı** temsil ediyor:

- **Görseller (HE-QA örnek kataloğu):** Sıcak krem/bej zemin, koyu kahve/siyah tipografi, **yumuşak köşeli** (≈10-14px radius) ürün fotoğrafları, kum rengi fiyat rozeti (üstü çizili web fiyatı + kalın toptan fiyatı), renk noktacıkları, beden pilleri, ikon+etiket güven bandı. Bu, **PDF/katalog çıktısının** birebir referansıdır.
- **`DESIGN (3).md` (Misuko sistemi):** Sıfır-radius, gölgesiz, tek fontlu (beausite), ghost-outline buton disiplinine sahip editoryal bir **admin/SaaS arayüz dili**. Renk paleti (bej/linen/pebble/bark) HE-QA'nın markasına ait değil — bu bir *başka markanın* token setidir.

Brief'in kendi kuralına göre ("ikisi arasında çelişki olursa ekteki referanslar önceliktir") şu ayrımı uyguluyorum:

| Katman | Kaynak |
|---|---|
| **PDF Katalog şablonu** (kapak, ürün kartı, grid, rozet, ikon bandı) — kompozisyon/layout | Görsellerdeki **birebir** HE-QA yerleşimi — yuvarlak köşeli kartlar, 3×2 grid, fiyat rozeti biçimi, kompozisyon aynen korunur |
| **Renk paleti** (hem admin panel hem PDF için) — **netleşti** | `DESIGN (3).md`'nin tam hex token seti **birebir** kullanılıyor: Bone White `#fcf9ee` (zemin), Linen `#f2efe3` (kart yüzeyi), Pebble `#bcbab2` (hairline), Bark `#6a6965` (ikincil metin), Ink Black `#000000` (birincil metin/kenarlık). Görsellerdeki krem/kahve izlenimiyle uyumlu, ekstra bir renk çıkarımına gerek kalmadı. |
| **Yönetici Paneli (web UI) tasarım disiplini** | `DESIGN (3).md`'nin editoryal/flat/hairline/ghost-button felsefesi ve tipografi ölçeği (beausite, 14–48px, negatif tracking) **birebir** uygulanır |

Özet: **layout/kompozisyon** görsellerden, **renk ve tipografi token'ları** `DESIGN (3).md`'den — iki referans artık çelişmiyor, aksine tamamlayıcı.

---

## 1. Teknoloji Mimarisi

| Katman | Seçim | Gerekçe | Alternatif (ve neden elenmedi) |
|---|---|---|---|
| Frontend | **Next.js 14 (App Router) + TypeScript + Tailwind CSS v4** | Admin paneli + API tek repo'da; Tailwind v4'ün `@theme` değişkenleri `DESIGN.md`'deki CSS custom property token setiyle doğrudan eşleşiyor | Vite+React SPA — ayrı backend gerektirir, tek-repo basitliğini kaybettirir |
| UI bileşenleri | shadcn/ui (headless) + özel tema | Radius/gölge/spacing token'larını satır satır override edebilme (Misuko'nun 0-radius/no-shadow kuralını uygulamak için) | Hazır bir component kit (MUI, Ant) — tasarım diline zorlukla uyar, override maliyeti yüksek |
| State | TanStack Query (sunucu state) + Zustand (katalog seçim state'i) | Ürün senkron verisi sunucu kaynaklı → cache/invalidation TanStack Query'nin işi; "seçili ürünler + sıralama" geçici UI state'i Zustand'da | Redux — bu ölçekte gereksiz boilerplate |
| Backend | Next.js Route Handlers + ayrı **worker/API service** (Node/Express) | Web isteklerini bloklamayan senkron/PDF işleri için ayrı, kalıcı çalışan bir servis şart (bkz. §6 ve "Barındırma" altında) | Tamamen Next.js API Routes üzerinde — Vercel serverless fonksiyonları BullMQ worker'ı ve Playwright'ı güvenilir şekilde barındıramaz |
| ORM / DB | **PostgreSQL + Prisma** | İlişkisel veri (ürün↔renk↔beden↔kategori çoklu-çoklu) + JSONB ile esnek tsoft ham-veri saklama | MongoDB — varyant/kategori ilişkilerinde join mantığı SQL'de daha güvenli |
| Kuyruk | **BullMQ + Redis** | PDF üretimi ve senkron job'ları arka planda, retry/ilerleme takibiyle — **Rankify projesinde aynı kombinasyon (`bullmq` + `ioredis` + `node-cron`) zaten production'da kanıtlanmış**, aynı paternin tekrar kullanılması önerilir | Doğrudan `setTimeout`/cron-only — 100+ ürünlük PDF'te istek zaman aşımına düşer |
| Görsel depolama | S3 uyumlu object storage (Cloudflare R2 / AWS S3) | tsoft'un görsellerini **yüksek çözünürlüklü kopya olarak cache'leyip** kendi depomuzda tutmak; baskı kalitesi için tsoft CDN'in sıkıştırdığı küçük görsele bağımlı kalmamak | Doğrudan tsoft görsel URL'sini hotlink etmek — kaynak silinirse/URL değişirse geçmiş PDF'ler bozulur |
| PDF motoru | **Playwright (headless Chromium) → HTML/CSS'ten PDF** | Görsellerdeki karmaşık editoryal grid/kolaj kompozisyonunu CSS Grid/Flexbox ile birebir üretebilme; aynı React bileşenlerini sunucu tarafında render edip önizleme=çıktı tutarlılığı sağlama | `@react-pdf/renderer` — daha hafif ve native PDF üretir ama CSS Grid/gelişmiş tipografi desteği sınırlı, kapak sayfasındaki kolaj/serbest yerleşimi karşılamakta zorlanır |
| Dağıtım | **Vercel** (Next.js admin panel/frontend) + **Railway** (worker/API servisi) — netleşti | Vercel frontend için doğru seçim; ancak Playwright'ın headless Chromium'u ve BullMQ worker'ı Vercel'in serverless fonksiyon süre/bellek limitlerine takılır. **Rankify projesi tam olarak bu ikili yapıyı kullanıyor** (`vercel.json`'da `/api/*` istekleri Railway'deki Express servisine rewrite ediliyor) — HE-QA aynı kanıtlanmış paterni izliyor: Vercel → statik/SSR frontend, Railway → API + BullMQ worker + Playwright + tsoft senkron | Vercel-only (Edge/Serverless Functions ile PDF üretmeye çalışmak) — Rankify'nin kendi geçmişinde bu ayrım zaten gerekli görülmüş, tekrar aynı duvara çarpmamak için doğrudan ikili yapıyla başlanıyor |

### tsoft Entegrasyon Yöntemi

**HE-QA'nın tsoft hesabında gerçek REST API erişimi var** ve bu, `HE-QA-Katalog-Uygulama-Promptu.md` ile aynı klasörde bulunan **Rankify projesinde** (`Desktop/Proje/GitHub/Rankify`) zaten production'da çalışan bir client ile kanıtlanmış durumda. HE-QA entegrasyonu bu kodun **doğrudan uyarlanmasıyla** kurulacak — sıfırdan keşif gerekmiyor:

**Kaynak dosyalar (Rankify):**
- [`src/services/tsoft-client.ts`](../../GitHub/Rankify/src/services/tsoft-client.ts) — asıl client sınıfı
- [`src/services/tsoft-client-api.ts`](../../GitHub/Rankify/src/services/tsoft-client-api.ts) — arayüz tanımı
- [`src/db/credentials.repo.ts`](../../GitHub/Rankify/src/db/credentials.repo.ts) — kimlik bilgisi saklama
- [`src/utils/crypto.ts`](../../GitHub/Rankify/src/utils/crypto.ts) — AES-256-GCM şifreleme
- [`src/types/tsoft.ts`](../../GitHub/Rankify/src/types/tsoft.ts) — tip tanımları

**Tespit edilen API detayları:**
- **Kimlik doğrulama (REST1):** `POST /rest1/auth/login/{kullanıcıAdı}` (query param `user`+`pass`) → token; token her isteğe form-encoded body içinde eklenir. Alternatif **V3 admin API**: `POST /api/v3/admin/auth/login` (email+password) → Bearer token; kalıcı bir API token varsa (`apiToken`) 2FA akışı tamamen atlanabiliyor.
- **Ürün çekme:** `POST /rest1/product/get` — `CategoryIds` veya `ProductCode` (`|` ile ayrılmış toplu kod listesi), `FetchDetails=true`, `StockFields=true`, `start`/`limit` (500'lük sayfalama) parametreleriyle. Rankify'de 50'lik batch + istekler arası 500ms bekleme + 3 deneme retry uygulanıyor — aynı rate-limit disiplini HE-QA'da korunmalı.
- **Kategoriler:** `POST /rest1/category/getCategories`.
- **Satış performansı verisi:** Bu hesapta `report/getSalesReport` uç noktası kapalı (`"Controller is not allowed!"`) — Rankify bunun yerine `order/get` (FetchProductData=true, tarih aralığı) ile siparişleri çekip ürün bazında adet/ciro topluyor (`getSalesViaOrders`). **Aynı yöntem HE-QA'nın "Satış Performansı" alanı için doğrudan kullanılabilir** — bu açık soruyu da çözüyor.
- **Kimlik bilgisi güvenliği:** Rankify'de tsoft kullanıcı adı/şifresi **AES-256-GCM ile şifrelenmiş halde Postgres'te** (`tsoft_credentials` tablosu) tutuluyor, sadece sunucu tarafında `getCredentials()` ile çözülüyor — istemciye hiçbir zaman gönderilmiyor. HE-QA için **bu şemanın ve `crypto.ts` modülünün birebir kopyalanması** öneriliyor (bkz. Guardrail §6).
### Faz 0 Ham Veri Keşfi — Tamamlandı (2026-07-18, gerçek HE-QA hesabına karşı)

`getCategoryProductsRawSample()` ile HE-QA'nın gerçek tsoft hesabına (229 kategori, canlı ürün verisi) karşı çalıştırıldı. Örnek ham yanıt [`docs/kesif-tsoft-ornek-veri.json`](kesif-tsoft-ornek-veri.json)'de referans olarak saklanıyor. Bulgular:

| İhtiyaç | Sonuç |
|---|---|
| **Açıklama** | `Details` alanı — zengin HTML (kalıp tablosu, manken ölçüleri, bakım önerisi dahil). `ShortDescription` her zaman boş geliyor. |
| **Kumaş bilgisi** | Ayrı bir alan **yok** — `Details` HTML'inin içine serbest metin olarak gömülü (örn. "%100 Pamuk müslin kumaş"). En iyi çaba regex'iyle çıkarılıyor (`extractFabricInfo()`), bulunamazsa admin manuel girer. |
| **Renk seçenekleri** | Ayrı bir liste **yok** — **her renk kendi `ProductCode`'una sahip ayrı bir tsoft ürünüdür** (örn. `T7806` "...Gri" / `T7807` "...Mavi"). Renk adı `Additional2`/`Additional5` alanında; kardeş renk varyantları `RelatedProductsIds1`'de (virgüllü id listesi) geliyor. Senkron sonrası bu ilişkiden swatch listesi yeniden inşa ediliyor (`syncColorSwatches()`). |
| **Beden (varyant) kırılımı** | ⚠️ **Bu API kullanıcısıyla erişilemiyor.** `product/get` hiçbir parametre kombinasyonuyla (`FetchDetails`, `StockFields`, `SubProducts=true`, `ProductCode` filtresi) alt varyant dizisi döndürmüyor; `product/getDetail`, `getSubProducts`, `getVariants`, `getStock` uçları `"Bu modüle erişim yetkiniz bulunmamaktadır!"` hatası veriyor. `Stock` alanı tüm bedenlerin toplamı (kırılım yok). **Yeni açık soru — bkz. §7.** |
| **Görsel galerisi** | `ImageUrl` tek bir dosya adı döndürüyor (`ImageUrlCdn` boş geliyor); çoklu galeri görseli için CDN URL şablonunun ayrıca doğrulanması gerekiyor (ileri faz). |

Bu bulgular `apps/worker/src/services/tsoft-client.ts`'deki `mapProduct()`'a ve `apps/worker/src/services/sync.service.ts`'e işlendi.

Senkron her durumda **sunucu tarafı worker** üzerinden çalışır ve **yalnızca manuel "Şimdi Senkronize Et" tetiklemesiyle** başlar (otomatik/zamanlanmış senkron MVP kapsamında yok — bkz. §5, §7); istemciden asla doğrudan tsoft'a istek atılmaz, kimlik bilgisi istemciye hiçbir şekilde ulaşmaz.

---

## 2. Veritabanı Şeması (Prisma DSL taslağı)

```prisma
model Product {
  id                String    @id @default(cuid())
  tsoftProductId    String    @unique          // kaynak sistemdeki orijinal id
  name              String                     // web sitesindeki orijinal isim, korunur
  code              String    @unique           // örn. HQ-TK-001
  categoryId        String
  category          Category  @relation(fields: [categoryId], references: [id])
  description       String?
  fabricInfo        String?                    // "%85 Polyester %15 Elastan"
  sourcePriceTry     Decimal   @db.Decimal(12,2) // tsoft'taki web/liste fiyatı (TRY, tek doğruluk kaynağı)
  stockStatus       StockStatus @default(UNKNOWN)
  manualSortWeight  Int?                        // yönetici manuel sıralama
  salesScore        Decimal?  @db.Decimal(10,2) // satış performansı (varsa otomatik, yoksa manuel)
  isActive          Boolean   @default(true)
  sourceMissingSince DateTime?                  // son N senkronda kaynakta bulunamadıysa dolar (soft-delete)
  archivedAt        DateTime?
  lastSyncedAt      DateTime?
  rawSourcePayload  Json?                       // tsoft'tan gelen ham veri (debug/denetim)
  images            ProductImage[]
  colors            ProductColor[]
  sizes             ProductSize[]
  catalogItems      CatalogItem[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

model ProductImage {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  url        String              // kendi object storage'ımızdaki cache edilmiş yüksek çözünürlüklü kopya
  sourceUrl  String              // tsoft orijinal url (referans)
  isPrimary  Boolean  @default(false)
  sortOrder  Int      @default(0)
}

model ProductColor {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  name       String              // "Açık Lacivert"
  hexPreview String?             // thumbnail'ten örneklenen yaklaşık renk
  sortOrder  Int      @default(0)
}

model ProductSize {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  label      String              // "S", "38", "XL"
  sortOrder  Int      @default(0)
}

model Category {
  id        String     @id @default(cuid())
  name      String     @unique   // "Tunik", "Gömlek", "Elbise"...
  slug      String     @unique
  parentId  String?
  parent    Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children  Category[] @relation("CategoryTree")
  products  Product[]
}

model ExchangeRate {
  id           String   @id @default(cuid())
  currency     Currency               // USD, EUR
  ratePerTry   Decimal  @db.Decimal(12,6)  // 1 <currency> = X TRY
  source       RateSource              // MANUAL | AUTO_API
  effectiveAt  DateTime @default(now())
}

model Settings {
  id                   String  @id @default("singleton")
  wholesaleDiscountPct Decimal @db.Decimal(5,2) @default(40.00) // sistemde SABİT kural, tek yerden yönetilir
  defaultCurrency      Currency @default(TRY)
  brandLogoUrl         String?
  companyFooterInfo    Json?
}

model Catalog {
  id              String        @id @default(cuid())
  name            String                     // "2024/2025 Yeni Sezon"
  currency        Currency
  coverTitle      String?
  coverSubtitle   String?
  language        Language      @default(TR)  // MVP: yalnızca TR üretilir, alan ileri faz için hazır tutulur
  status          CatalogStatus @default(DRAFT) // DRAFT | GENERATING | READY | FAILED
  pdfUrl          String?                     // üretilen PDF'in object storage adresi (üretildiği anki fiyat/görsel anlık görüntüsü — immutable)
  generatedAt     DateTime?
  items           CatalogItem[]
  createdBy       String
  createdAt       DateTime      @default(now())
}

model CatalogItem {
  id         String   @id @default(cuid())
  catalogId  String
  catalog    Catalog  @relation(fields: [catalogId], references: [id])
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  sortOrder  Int
  // fiyat/görsel bu satıra "donmuş" halde KOPYALANMAZ; PDF üretim anında hesaplanır ve
  // sadece üretilmiş PDF dosyası (pdfUrl) o anın değişmez kaydı olur.
}

model SyncRun {
  id              String    @id @default(cuid())
  startedAt       DateTime  @default(now())
  finishedAt      DateTime?
  status          SyncStatus // RUNNING | SUCCESS | FAILED
  method          SyncMethod // API | FEED | SCRAPE | MANUAL_IMPORT
  productsUpserted Int      @default(0)
  productsMissing  Int      @default(0)   // kaynakta artık görünmeyenler
  errorMessage    String?
  logDetail       Json?
}

model AdminUser {
  id       String   @id @default(cuid())
  email    String   @unique
  name     String                       // tek rol yeterli (netleşti) — rol/izin ayrımı yok, tüm adminler eşit yetkili
  passwordHash String
  createdAt DateTime @default(now())
}

enum Currency { TRY USD EUR }
enum Language { TR AR EN }
enum StockStatus { IN_STOCK LOW_STOCK OUT_OF_STOCK UNKNOWN }
enum RateSource { MANUAL AUTO_API }
enum CatalogStatus { DRAFT GENERATING READY FAILED }
enum SyncStatus { RUNNING SUCCESS FAILED }
enum SyncMethod { API MANUAL_IMPORT }   // FEED/SCRAPE kaldırıldı — gerçek tsoft API erişimi teyit edildi
```

**Fiyat hesaplama kuralı (tek fonksiyon, tekrar edilmez):**
```
wholesaleTry = round2(sourcePriceTry * (1 - discountPct/100))   // önce TRY üzerinde indirim
displayPrice = round2(wholesaleTry / ratePerTry)                // sonra hedef para birimine çevrim
```
Bu sıra **sabittir** (önce indirim, sonra çevrim) — tersi (önce çevrim sonra indirim) farklı ondalık yuvarlama sonuçları üretebileceğinden hem UI hem PDF **aynı paylaşılan `calculatePrice()` fonksiyonunu** çağırır; mantık iki yerde ayrı ayrı yazılmaz.

---

## 3. Ekran Listesi ve Bileşen Kırılımı

| # | Ekran | Ana Bileşenler |
|---|---|---|
| 1 | **Giriş** | E-posta/şifre formu, hata mesajı |
| 2 | **Dashboard** | Son senkron durumu kartı, toplam ürün/kategori sayacı, son üretilen katalog listesi, hızlı eylem butonları |
| 3 | **Ürün Seçim Paneli** | Arama kutusu, kategori çoklu-filtre (chip grubu), sıralama seçici (Performans / Manuel / Fiyat), stok rozeti, grid/liste görünüm anahtarı, ürün kartı (foto + ad + kod + stok + checkbox), toplu seç/kaldır bandı, "Katalog Oluşturucuya Gönder" CTA |
| 4 | **Ürün Detay** | Senkron alanları salt-okunur görünüm (isim/kategori/kumaş/varyantlar), manuel sıralama ağırlığı ve satış skoru düzenleme alanı, senkron geçmişi |
| 5 | **Katalog Oluşturucu** | Seçili ürün listesi (sürükle-bırak sıralama), kapak sayfası formu (başlık/alt başlık/sezon), para birimi seçici, şablon seçici (ileri faz), "Önizle" ve "PDF Üret" butonları. *(Dil seçici MVP'de yok — arayüz sabit Türkçe; §5 Faz 5'te eklenecek.)* |
| 6 | **Katalog Önizleme** | Sayfa sayfa canlı HTML önizleme (PDF şablonuyla birebir aynı bileşen, `mode=preview`) |
| 7 | **Katalog Geçmişi** | Tarih/isim/durum tablosu, indir/yeniden üret/sil eylemleri, "fiyatlar güncel değil" uyarı rozeti (kur/ürün değiştiyse) |
| 8 | **Senkronizasyon Yönetimi** | "Şimdi Senkronize Et" butonu, çalıştırma geçmişi tablosu, hata detay paneli, "kaynakta bulunamayan ürünler" inceleme kuyruğu |
| 9 | **Ayarlar** | Kur girişi (manuel + opsiyonel oto-API anahtarı), varsayılan para birimi, indirim yüzdesi (salt-okunur/kilitli alan — kasıtlı olarak zor değiştirilir, bkz. Guardrail), logo/marka varlıkları yükleme |
| 10 | **Kullanıcı Yönetimi** | Basit kullanıcı listesi + davet (ekle/sil) — **rol/izin ayrımı yok**, tüm adminler aynı yetkiye sahip (netleşti) |

---

## 4. PDF Şablon Yapısı

**Sayfa boyutu:** A4 dikey (210×297mm), baskı kenar boşluğu 12–15mm, 300dpi görsel gömme.

- **Kapak Sayfası:** Sol %55 tam kenarlı hero fotoğraf; sağ panelde `HE-QA / SIMPLE. MODERN. YOU.` marka bloğu, "KATALOG / YENİ SEZON KOLEKSİYONU" başlığı, sezon etiketi (2024/2025), İÇİNDEKİLER listesi (numara + kategori adı), 4 görsellik dikey kolaj şeridi (isteğe bağlı, ilk sezon ürünlerinden otomatik seçilir).
- **Kategori Bölüm Başlığı (opsiyonel ara sayfa):** Kategori adı + alt açıklama + "X. SAYFA" rozeti — görsellerdeki "TUNİK & GÖMLEK KOLEKSİYONU" bandı gibi.
- **Ürün Grid Sayfası:** 3 sütun × 2 satır (sayfa başına 6 ürün). Her kart:
  - Ürün fotoğrafı (dikey, 10-14px köşe yuvarlama, tam kaplayan kırpma)
  - Ürün adı (büyük harf, kalın) + Ürün Kodu
  - Renk noktacıkları satırı (küçük daire önizlemeler)
  - Beden pilleri (S/M/L veya 36/38/40 etiket grubu)
  - Kumaş bilgisi satırı
  - Fiyat bloğu: üstü çizili web fiyatı + kalın toptan fiyatı + "%40 İNDİRİMLİ" kum rengi rozet
- **Alt Güven Bandı** (kapak ve/veya son sayfa): 4 ikon+etiket ("%40 Toptan İndirim", "Güncel Ürünler ve Fiyatlar", "Hızlı Kargo Dünya Çapında", "Güvenli Alışveriş ve Destek")
- **Kapanış/İletişim Sayfası:** Marka iletişim bilgisi, web sitesi, sosyal medya (ileri faz).

Tüm sayfalar **aynı React bileşen ağacı** ile hem web önizlemede hem Playwright PDF renderında kullanılır — "önizlediğin çıktıdır" garantisi böyle sağlanır.

**Dil:** MVP'de tüm sabit metinler (İÇİNDEKİLER, KUMAŞ BİLGİSİ, TOPTAN FİYATI, rozet metinleri vb.) yalnızca **Türkçe**, hardcoded. Şablon yine de metin bileşenleri i18n anahtarları (`t('catalog.tableOfContents')` gibi) üzerinden yazılacak ki Faz 5'te AR/EN eklenirken sayfa düzeni değil sadece çeviri katmanı değişsin.

---

## 5. Faz Planı

| Faz | Kapsam | Süre (tahmini) |
|---|---|---|
| **Faz 0 — Keşif & Kurulum** | Rankify'deki `tsoft-client.ts`/`credentials.repo.ts`/`crypto.ts`'nin HE-QA reposuna uyarlanması, `getCategoryProductsRawSample()` ile HE-QA hesabına karşı ham veri keşfi (kumaş/renk/açıklama/görsel alan adlarının tespiti), repo/CI kurulumu, Prisma şema + ilk migration | 1 hafta |
| **Faz 1 — MVP** | Gerçek tsoft API entegrasyonu ile ürün senkronu (**yalnızca manuel "Şimdi Senkronize Et" tetiklemeli** — netleşti), Ürün Seçim Paneli, tek şablonlu PDF üretimi (yalnız TRY, yalnız Türkçe), Ayarlar (kur manuel girişi, sabit %40 kural) | 2–3 hafta |
| **Faz 2 — Çoklu Para Birimi & Katalog Yönetimi** | USD/EUR (manuel kur girişi), katalog kaydetme/geçmiş, canlı önizleme ekranı, kapak sayfası özelleştirme, sürükle-bırak sıralama, tsoft `order/get` verisinden satış performansı skoru | 2 hafta |
| **Faz 3 — Senkron İyileştirmeleri** *(düşük öncelik)* | Stok/ürün verisi bilinçli olarak gerçek zamanlı değil, yalnızca manuel tetiklemeyle güncellendiği için otomatik/zamanlanmış senkron **MVP gereksinimi değil** — talep gelirse eklenecek opsiyonel bir job olarak backlog'da tutulur; bu fazda yalnızca sync log/"kaynakta silinen ürün" kuyruğu netleştirilir | 1 hafta |
| **Faz 4 — Performans & Ölçek** | BullMQ kuyruklu PDF üretimi (öngörülen hacim: **~25 katalog/ay, katalog başına ~50 ürün ≈ 9 içerik sayfası** — tek worker ile rahatça karşılanır, agresif ölçekleme gerekmez), görsel cache/optimizasyon | 1 hafta |
| **Faz 5 — Backlog** | Çoklu dil (AR/EN ekleme — MVP sonrası, kesinleşti), çoklu şablon/tema desteği, opsiyonel otomatik senkron | Sonraki iterasyonlar |

---

## 6. Guardrail Karşılıkları

- **Yuvarlama/tutarlılık:** Tek `calculatePrice(sourcePriceTry, discountPct, ratePerTry)` fonksiyonu hem UI hem PDF tarafından import edilir; birim test matrisi: sınır değerler (`x.xx5` yuvarlama), 0/negatif fiyat guard'ı, 3 para biriminin de aynı ürün için tutarlı sonuç verdiğini doğrulayan snapshot testleri.
- **tsoft kimlik bilgileri:** Rankify'de kanıtlanmış patern birebir uygulanır — kullanıcı adı/şifre `AES-256-GCM` ile şifrelenip Postgres'te (`tsoft_credentials` tablosu) saklanır, şifreleme anahtarı yalnızca sunucu ortam değişkeninde (`ENCRYPTION_KEY`) tutulur, çözme işlemi yalnızca worker/server tarafında `getCredentials()` ile yapılır. Hiçbir zaman `NEXT_PUBLIC_*` değişkeninde ya da istemciye giden response'ta yer almaz; senkron tetikleme UI'dan yalnızca "job'u kuyruğa ekle" isteği gönderir, kimlik bilgisi istemciye hiç dönmez.
- **100+ ürünlük PDF performansı:** BullMQ job kuyruğu + ayrı worker container, görsellerin üretim öncesi 300dpi'ye optimize edilmiş cache kopyaları, sayfa-sayfa render edip `pdf-lib` ile birleştirme, ilerleme durumu + zaman aşımı/retry.
- **Senkron veri kaybı/çakışma:** Hard-delete yok; kaynakta bulunamayan ürün `sourceMissingSince` ile işaretlenir, N ardışık senkrondan sonra `archivedAt` set edilir ve yeni katalog oluşturmada listelenmez ama geçmiş PDF'leri etkilemez (PDF üretildiği anın değişmez görüntüsüdür — `Catalog.pdfUrl` sabit dosya, canlı veriye bağlı değildir).
- **Gerekçelendirme:** Her ana teknik karar için alternatif ve red gerekçesi §1 tablosunda verildi.

---

## 7. Açık Sorular

**Çözülen sorular:**

| # | Soru | Karar |
|---|---|---|
| 1 | tsoft erişimi | Gerçek API mevcut; Rankify projesindeki `tsoft-client.ts` uyarlandı (§1) |
| 2 | Çoklu dil kapsamı | MVP'de yok, yalnızca Türkçe; AR/EN Faz 5'e ertelendi (§5) |
| 3 | Yönetici rolü | Tek rol yeterli, rol/izin ayrımı yok (§2, §3) |
| 4 | Hacim | Ortalama 25 katalog/ay, katalogda ortalama 50 ürün (§5, PDF ölçek planlaması buna göre yapıldı) |
| 5 | Satış performansı verisi | tsoft API'sinden `order/get` ile hesaplanıyor, Rankify'nin `getSalesViaOrders` yöntemi aynen kullanılıyor (§1) |
| 6 | Marka paleti | `DESIGN (3).md`'nin hex token seti birebir kullanılıyor (§0) |
| 7 | Barındırma | Vercel (frontend) + **Railway** (worker/API — Rankify ile aynı sağlayıcı, netleşti) |
| 8 | Stok gerçek zamanlılığı | Anlık değil — yalnızca manuel "Şimdi Senkronize Et" tetiklemesiyle güncellenir (§1, §5) |
| 9 | Kur kaynağı | Tamamen manuel giriş, otomatik kur API'si yok |
| 10 | tsoft API kimlik bilgileri | Rankify projesindeki mevcut kayıtlar kullanıldı, Faz 0 keşfi bu kimlik bilgileriyle çalıştırıldı (§1, §6) |

**Yeni açık soru (Faz 0 keşfinden çıktı):**

11. **Beden/varyant API izni:** Mevcut tsoft API kullanıcısı (`ensartomakin@he-qa.com`) beden bazlı stok/varyant verisine erişemiyor — `product/getSubProducts`, `getVariants`, `getDetail`, `getStock` uçları "erişim yetkiniz bulunmamaktadır" hatası veriyor, `product/get` de hiçbir parametreyle alt varyant dizisi döndürmüyor. **İki seçenek var:** (a) tsoft yönetici panelinden bu API kullanıcısına ilgili modül izinleri açılır — en temiz çözüm, ya da (b) MVP'de bedenler Ürün Detay ekranından manuel girilir (mevcut geçici çözüm, `sync.service.ts`'e not düşüldü). Hangisini tercih edersiniz?
