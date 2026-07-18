/**
 * Worker servisine (Railway) yalnızca Next.js sunucu tarafından (Route Handlers / Server
 * Components) erişilir. INTERNAL_API_KEY tarayıcıya asla gönderilmez — bu dosya "use client"
 * bileşenlerinden import edilmemelidir.
 */

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function workerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!INTERNAL_API_KEY) {
    throw new Error('INTERNAL_API_KEY tanımlı değil (apps/web sunucu ortam değişkeni).');
  }

  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Worker isteği başarısız [${res.status}] ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}
