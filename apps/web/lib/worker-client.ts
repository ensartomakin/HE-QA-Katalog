/**
 * Worker servisine (Railway) yalnızca Next.js sunucu tarafından (Route Handlers / Server
 * Components) erişilir. INTERNAL_API_KEY tarayıcıya asla gönderilmez — bu dosya "use client"
 * bileşenlerinden import edilmemelidir.
 */

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/** Worker'ın 4xx/5xx yanıtında döndürdüğü `{ error }` JSON gövdesini ve HTTP status'ünü taşır
 *  — Route Handler'lar bunu yakalayıp aynı status/gövdeyle tarayıcıya iletebilir (bkz.
 *  apps/web/app/api/catalogs/route.ts, apps/web/app/api/users/route.ts). Yakalanmazsa
 *  Next.js bunu generic 500'e çevirir ve worker'ın asıl hata mesajı kaybolur. */
export class WorkerFetchError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body !== null && 'error' in body ? String((body as { error: unknown }).error) : `Worker isteği başarısız [${status}]`);
    this.status = status;
    this.body = body;
  }
}

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
    const text = await res.text().catch(() => '');
    const body = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    })();
    throw new WorkerFetchError(res.status, body);
  }

  return res.json() as Promise<T>;
}
