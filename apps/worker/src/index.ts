import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { requireInternalAuth } from './middleware/internal-auth';
import { settingsRouter } from './api/settings.routes';
import { syncRouter } from './api/sync.routes';
import { productsRouter } from './api/products.routes';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY tanımlı değil — tsoft kimlik bilgileri şifrelenemez, servis başlatılamıyor.');
}
if (!process.env.INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY tanımlı değil — apps/web ile servis arası çağrılar korunamaz.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/settings', requireInternalAuth, settingsRouter);
app.use('/api/sync', requireInternalAuth, syncRouter);
app.use('/api/products', requireInternalAuth, productsRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logger.info(`[worker] ${port} portunda dinleniyor`);
});
