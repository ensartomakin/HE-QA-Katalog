import { jwtVerify } from 'jose';

export const SESSION_COOKIE = 'he_qa_session';

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tanımlı değil (apps/web sunucu ortam değişkeni).');
  return new TextEncoder().encode(secret);
}

/** Edge middleware'de de Node route handler'larda da çalışır (jose Web Crypto kullanır). */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
