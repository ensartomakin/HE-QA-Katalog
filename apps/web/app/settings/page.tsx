'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`İstek başarısız: ${url}`);
  return res.json();
}

export default function SettingsPage() {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['tsoft-credentials-status'],
    queryFn: () => fetchJson<{ configured: boolean }>('/api/settings/tsoft-credentials/status'),
  });

  const testConnection = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      fetchJson<{ ok: boolean; message: string }>('/api/settings/tsoft-credentials/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => setTestResult(res.message),
    onError: (err) => setTestResult(err instanceof Error ? err.message : 'Bağlantı hatası'),
  });

  const saveCredentials = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      fetchJson('/api/settings/tsoft-credentials', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setSaveMessage('Kaydedildi.');
      refetchStatus();
    },
    onError: (err) => setSaveMessage(err instanceof Error ? err.message : 'Kaydetme hatası'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      apiUrl: String(form.get('apiUrl') ?? ''),
      storeCode: String(form.get('storeCode') ?? ''),
      apiUser: String(form.get('apiUser') ?? ''),
      apiPass: String(form.get('apiPass') ?? ''),
    };
    saveCredentials.mutate(payload);
  }

  function handleTest(e: React.MouseEvent<HTMLButtonElement>) {
    const formEl = e.currentTarget.closest('form');
    if (!formEl) return;
    const form = new FormData(formEl);
    testConnection.mutate({
      apiUrl: String(form.get('apiUrl') ?? ''),
      storeCode: String(form.get('storeCode') ?? ''),
      apiUser: String(form.get('apiUser') ?? ''),
      apiPass: String(form.get('apiPass') ?? ''),
    });
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[40px] max-w-[520px]">
        <h1 className="text-[34px] leading-[1.08]">Ayarlar</h1>

        <section className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">tsoft Bağlantısı</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            {status?.configured ? 'Bağlantı bilgileri kayıtlı.' : 'Henüz bağlantı bilgisi girilmedi.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[17px]">
            <input name="apiUrl" placeholder="https://magazaadresi.com" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <input name="storeCode" placeholder="Mağaza Kodu" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <input name="apiUser" placeholder="API Kullanıcı Adı" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />
            <input name="apiPass" type="password" placeholder="API Şifresi" required className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none" />

            <div className="flex gap-[11px]">
              <button type="submit" className="btn-ghost" disabled={saveCredentials.isPending}>
                Kaydet
              </button>
              <button type="button" className="btn-ghost" onClick={handleTest} disabled={testConnection.isPending}>
                Bağlantıyı Test Et
              </button>
            </div>

            {testResult && <p className="text-[14px] text-[var(--color-bark)]">{testResult}</p>}
            {saveMessage && <p className="text-[14px] text-[var(--color-bark)]">{saveMessage}</p>}
          </form>
        </section>
      </div>
    </main>
  );
}
