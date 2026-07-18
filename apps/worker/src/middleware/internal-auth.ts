import type { NextFunction, Request, Response } from 'express';

/**
 * Worker servisi asla doğrudan tarayıcıdan çağrılmaz — yalnızca apps/web (Next.js) sunucu
 * tarafından, paylaşılan bir gizli anahtarla çağrılır. Kullanıcı oturumu/rol yönetimi
 * apps/web katmanında yapılır (tek rol yeterli — netleşti, ayrı bir yetki sistemi gerekmiyor).
 */
export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('x-internal-key');
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Yetkisiz' });
    return;
  }
  next();
}
