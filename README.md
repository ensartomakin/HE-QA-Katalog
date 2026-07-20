# HE-QA Toptan Katalog Yönetim Sistemi

Mimari ve tasarım kararları için bkz. [docs/SISTEM-TASARIMI.md](docs/SISTEM-TASARIMI.md).

## Yapı

```
apps/web      Next.js admin panel (Vercel'e deploy edilir)
apps/worker   Express API + tsoft senkron + PDF üretim worker'ı (Railway'e deploy edilir)
packages/db   Paylaşılan Prisma şeması + calculatePrice()
```

## Yerel Kurulum

1. PostgreSQL'i çalıştırın (yerel veya Railway'de bir dev veritabanı).
2. `apps/worker/.env.example` → `apps/worker/.env` kopyalayıp doldurun (`DATABASE_URL`, `ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `JWT_SECRET`).
3. `apps/web/.env.example` → `apps/web/.env.local` kopyalayıp doldurun (`WORKER_URL`, aynı `INTERNAL_API_KEY` ve aynı `JWT_SECRET`).
4. Bağımlılıkları kurun:
   ```
   npm install
   ```
5. Veritabanı şemasını uygulayın:
   ```
   npm run db:migrate
   ```
6. İki servisi ayrı terminallerde çalıştırın:
   ```
   npm run dev:worker   # http://localhost:3001
   npm run dev:web      # http://localhost:3000
   ```
7. `http://localhost:3000` ilk açılışta `/login`'e yönlendirir — hiç yönetici yoksa **ilk kurulum formu** çıkar (ad/e-posta/şifre girip hesap oluşturursunuz), sonraki girişlerde normal giriş formu görünür.
8. Admin panelde **Ayarlar** sekmesinden tsoft bağlantı bilgilerini girip test edin, ardından **Senkronizasyon** sekmesinden "Şimdi Senkronize Et" ile ilk veri çekimini yapın.

## Faz 0 — Tamamlandı (2026-07-18)

Gerçek HE-QA tsoft hesabına karşı ham veri keşfi yapıldı, bulgular `docs/SISTEM-TASARIMI.md` §1 ve `apps/worker/src/types/tsoft.ts`'e işlendi. Özet: açıklama ve kumaş bilgisi `Details` HTML alanından geliyor (kumaş regex ile en iyi çaba çıkarılıyor); renk seçenekleri T-Soft'ta ayrı ürünler olarak modellenmiş ve `RelatedProductsIds1` ile birbirine bağlı; **beden/varyant kırılımına bu API kullanıcısıyla erişilemiyor** (tsoft panelinden ek modül izni gerekiyor — bkz. `docs/SISTEM-TASARIMI.md` §7, madde 11, açık soru olarak kullanıcıya iletildi).
