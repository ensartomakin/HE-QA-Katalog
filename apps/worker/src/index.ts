import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { requireInternalAuth } from './middleware/internal-auth';
import { settingsRouter } from './api/settings.routes';
import { syncRouter } from './api/sync.routes';
import { productsRouter } from './api/products.routes';
import { authRouter } from './api/auth.routes';
import { catalogsRouter } from './api/catalogs.routes';

// Son çare güvenlik ağı: asyncHandler tüm route'ları kapsıyor olsa da, route dışı
// (örn. arka plan işleri, kütüphane içi) bir promise reddi kaçarsa Node 20'nin
// varsayılan davranışı TÜM PROCESS'İ SONLANDIRMAK'tır. Loglayıp süreci ayakta tutuyoruz.
process.on('unhandledRejection', (reason) => {
  logger.error(`[unhandledRejection] ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`[uncaughtException] ${err.stack ?? err.message}`);
});

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY tanımlı değil — tsoft kimlik bilgileri şifrelenemez, servis başlatılamıyor.');
}
if (!process.env.INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY tanımlı değil — apps/web ile servis arası çağrılar korunamaz.');
}
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil — admin oturumları imzalanamaz.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', requireInternalAuth, authRouter);
app.use('/api/settings', requireInternalAuth, settingsRouter);
app.use('/api/sync', requireInternalAuth, syncRouter);
app.use('/api/products', requireInternalAuth, productsRouter);
app.use('/api/catalogs', requireInternalAuth, catalogsRouter);

// Global hata middleware'i — asyncHandler ile yakalanıp next(err) ile buraya iletilen her
// route hatası burada sonlanır; process asla bir HTTP isteği yüzünden çökmez.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[${req.method} ${req.path}] ${message}`);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Sunucu hatası' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logger.info(`[worker] ${port} portunda dinleniyor`);
});
