import { prisma } from './prisma';
import { encrypt, decrypt } from '../utils/crypto';

/**
 * HE-QA tek-tenant bir sistem olduğundan (netleşti: tek yönetici rolü, çoklu mağaza yok),
 * Rankify'deki kullanıcı-bazlı kimlik bilgisi tablosunun aksine burada TEK bir singleton
 * satır (`TsoftCredential`, id="singleton") kullanılıyor.
 */
export interface TsoftCredentials {
  apiUrl: string;
  storeCode: string;
  apiUser: string;
  apiPass: string;
  apiToken?: string; // V3 Bearer token — kalıcı token varsa 2FA akışı atlanır
}

export async function upsertCredentials(creds: TsoftCredentials): Promise<void> {
  const apiPassEnc = encrypt(creds.apiPass);
  const apiTokenEnc = creds.apiToken ? encrypt(creds.apiToken) : null;

  await prisma.tsoftCredential.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      apiUrl: creds.apiUrl,
      storeCode: creds.storeCode,
      apiUser: creds.apiUser,
      apiPassEnc,
      apiTokenEnc,
    },
    update: {
      apiUrl: creds.apiUrl,
      storeCode: creds.storeCode,
      apiUser: creds.apiUser,
      apiPassEnc,
      apiTokenEnc,
    },
  });
}

export async function getCredentials(): Promise<TsoftCredentials | null> {
  const row = await prisma.tsoftCredential.findUnique({ where: { id: 'singleton' } });
  if (!row) return null;

  try {
    return {
      apiUrl: row.apiUrl,
      storeCode: row.storeCode,
      apiUser: row.apiUser,
      apiPass: decrypt(row.apiPassEnc),
      apiToken: row.apiTokenEnc ? decrypt(row.apiTokenEnc) : undefined,
    };
  } catch {
    // Bozuk ciphertext (örn. ENCRYPTION_KEY değişti) — eksik say, admin yeniden girsin.
    return null;
  }
}

export async function hasCredentials(): Promise<boolean> {
  const row = await prisma.tsoftCredential.findUnique({ where: { id: 'singleton' } });
  return row !== null;
}
