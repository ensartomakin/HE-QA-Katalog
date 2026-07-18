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
2. `apps/worker/.env.example` → `apps/worker/.env` kopyalayıp doldurun (`DATABASE_URL`, `ENCRYPTION_KEY`, `INTERNAL_API_KEY`).
3. `apps/web/.env.example` → `apps/web/.env.local` kopyalayıp doldurun (`WORKER_URL`, aynı `INTERNAL_API_KEY`).
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
7. Admin panelde **Ayarlar** sekmesinden tsoft bağlantı bilgilerini girip test edin, ardından **Senkronizasyon** sekmesinden "Şimdi Senkronize Et" ile ilk veri çekimini yapın.

## Faz 0 — Kalan keşif adımı

`apps/worker/src/services/tsoft-client.ts` içindeki `getCategoryProductsRawSample()` fonksiyonu, gerçek HE-QA tsoft hesabına karşı çalıştırılıp ham ürün yanıtı incelenmeli. Bu, `mapProduct()`'ın şu an `undefined` bıraktığı **kumaş bilgisi, renk seçenekleri, uzun açıklama ve görsel galerisi** alanlarının gerçek T-Soft anahtar adlarını ortaya çıkaracak (bkz. `src/types/tsoft.ts` içindeki TODO not).
