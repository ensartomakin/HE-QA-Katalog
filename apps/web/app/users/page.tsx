'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<{ users: AdminUser[] }>('/api/users'),
  });

  const createUser = useMutation({
    mutationFn: (payload: { email: string; name: string; password: string }) =>
      fetchJson('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Kullanıcı eklenemedi'),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Kullanıcı silinemedi'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createUser.mutate(
      {
        email: String(form.get('email') ?? ''),
        name: String(form.get('name') ?? ''),
        password: String(form.get('password') ?? ''),
      },
      { onSuccess: () => e.currentTarget.reset() }
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[40px] max-w-[600px]">
        <h1 className="text-[34px] leading-[1.08]">Kullanıcılar</h1>
        <p className="text-[14px] text-[var(--color-bark)]">
          Tek rol — tüm kullanıcılar aynı yetkiye sahip, rol/izin ayrımı yok.
        </p>

        {error && <p className="text-[14px] text-red-700">{error}</p>}

        <table className="w-full text-[14px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-pebble)] text-left">
              <th className="py-[9px] font-medium">İsim</th>
              <th className="py-[9px] font-medium">E-posta</th>
              <th className="py-[9px] font-medium">Eklendi</th>
              <th className="py-[9px] font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-[var(--color-pebble)]">
                <td className="py-[9px]">{u.name}</td>
                <td className="py-[9px]">{u.email}</td>
                <td className="py-[9px]">{new Date(u.createdAt).toLocaleDateString('tr-TR')}</td>
                <td className="py-[9px] text-right">
                  <button
                    type="button"
                    onClick={() => deleteUser.mutate(u.id)}
                    disabled={deleteUser.isPending}
                    className="hover:underline"
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">Yeni Kullanıcı Ekle</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-[17px]">
            <input name="name" placeholder="İsim" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <input name="email" type="email" placeholder="E-posta" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <input name="password" type="password" placeholder="Şifre (en az 8 karakter)" required minLength={8} className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <button type="submit" className="btn-ghost self-start" disabled={createUser.isPending}>
              {createUser.isPending ? 'Ekleniyor…' : '→ Ekle'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
