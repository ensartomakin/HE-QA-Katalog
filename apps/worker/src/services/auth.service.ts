import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 gün — tek rol, çoklu admin destekleniyor (netleşti: rol ayrımı yok)

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tanımlı değil.');
  return secret;
}

export interface SessionPayload {
  sub: string; // AdminUser.id
  email: string;
  name: string;
}

export async function hasAnyAdmin(): Promise<boolean> {
  const count = await prisma.adminUser.count();
  return count > 0;
}

/** İlk kurulum — yalnızca hiç admin yokken çalışır (bootstrap). Sonrasında kapanır. */
export async function bootstrapFirstAdmin(email: string, name: string, password: string): Promise<SessionPayload> {
  if (await hasAnyAdmin()) {
    throw new Error('Zaten en az bir yönetici kayıtlı — bootstrap yalnızca ilk kurulumda kullanılabilir.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.adminUser.create({ data: { email, name, passwordHash } });
  return { sub: user.id, email: user.email, name: user.name };
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

export async function login(email: string, password: string): Promise<{ token: string; user: SessionPayload }> {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) throw new Error('E-posta veya şifre hatalı.');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('E-posta veya şifre hatalı.');

  const payload: SessionPayload = { sub: user.id, email: user.email, name: user.name };
  return { token: signSessionToken(payload), user: payload };
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, getJwtSecret()) as SessionPayload;
}

export async function listAdmins() {
  return prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Tek rol yeterli (netleşti) — Kullanıcı Yönetimi ekranından ikinci/üçüncü admin eklemek için,
 *  bootstrapFirstAdmin'in aksine admin sayısı kısıtı yok. */
export async function createAdmin(email: string, name: string, password: string) {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new Error('Bu e-posta adresiyle zaten bir kullanıcı var.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.adminUser.create({ data: { email, name, passwordHash } });
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

/** Sistem admin'siz kalamaz — son kullanıcı silinemez. */
export async function deleteAdmin(id: string): Promise<void> {
  const count = await prisma.adminUser.count();
  if (count <= 1) throw new Error('Son yönetici hesabı silinemez.');
  await prisma.adminUser.delete({ where: { id } });
}
