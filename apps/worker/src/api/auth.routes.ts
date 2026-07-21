import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { bootstrapFirstAdmin, createAdmin, deleteAdmin, hasAnyAdmin, listAdmins, login, signSessionToken } from '../services/auth.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/async-handler';

export const authRouter = Router();

authRouter.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ hasAdmin: await hasAnyAdmin() });
  })
);

const bootstrapSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
});

authRouter.post(
  '/bootstrap',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = bootstrapSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const user = await bootstrapFirstAdmin(parsed.data.email, parsed.data.name, parsed.data.password);
      logger.info(`[auth] ilk yönetici oluşturuldu: ${user.email}`);
      res.json({ ok: true, user, token: signSessionToken(user) });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Bootstrap başarısız' });
    }
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await login(parsed.data.email, parsed.data.password);
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : 'Giriş başarısız' });
    }
  })
);

// Kullanıcı Yönetimi — tek rol, tüm adminler eşit yetkili (netleşti), bu yüzden ekstra
// bir izin kontrolü yok (worker'a erişim zaten requireInternalAuth ile korunuyor).
authRouter.get(
  '/users',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ users: await listAdmins() });
  })
);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
});

authRouter.post(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const user = await createAdmin(parsed.data.email, parsed.data.name, parsed.data.password);
      logger.info(`[auth] yeni kullanıcı eklendi: ${user.email}`);
      res.json({ user });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Kullanıcı eklenemedi' });
    }
  })
);

authRouter.delete(
  '/users/:id',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await deleteAdmin(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Kullanıcı silinemedi' });
    }
  })
);
