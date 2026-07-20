'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? 'İstek başarısız');
  return body;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJson<{ hasAdmin: boolean }>('/api/auth/status')
      .then((s) => setHasAdmin(s.hasAdmin))
      .catch(() => setHasAdmin(true)); // belirsizse güvenli taraf: giriş formu göster
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '');

    try {
      if (hasAdmin) {
        await fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      } else {
        await fetchJson('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email, name, password }) });
      }
      router.replace(searchParams.get('next') ?? '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  if (hasAdmin === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[14px] text-[var(--color-bark)]">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-[17px]">
      <div className="w-full max-w-[380px] flex flex-col gap-[25px]">
        <div>
          <h1 className="text-[34px] leading-[1.08]">HE-QA</h1>
          <p className="text-[14px] text-[var(--color-bark)]">
            {hasAdmin ? 'Yönetici Girişi' : 'İlk kurulum — yönetici hesabı oluşturun'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[17px]">
          {!hasAdmin && (
            <input
              name="name"
              placeholder="Ad Soyad"
              required
              className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
            />
          )}
          <input
            name="email"
            type="email"
            placeholder="E-posta"
            required
            className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Şifre"
            required
            minLength={hasAdmin ? undefined : 8}
            className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
          />

          {error && <p className="text-[14px] text-red-700">{error}</p>}

          <button type="submit" className="btn-ghost justify-center" disabled={loading}>
            {loading ? 'Bekleyin…' : hasAdmin ? 'Giriş Yap' : 'Hesap Oluştur ve Giriş Yap'}
          </button>
        </form>
      </div>
    </main>
  );
}
