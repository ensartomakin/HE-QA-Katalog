'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

interface Settings {
  wholesaleDiscountPct: string;
  defaultCurrency: 'TRY' | 'USD' | 'EUR';
  brandLogoUrl: string | null;
}

interface ExchangeRate {
  currency: 'USD' | 'EUR';
  ratePerTry: string;
  effectiveAt: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [generalMessage, setGeneralMessage] = useState<string | null>(null);
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['tsoft-credentials-status'],
    queryFn: () => fetchJson<{ configured: boolean }>('/api/settings/tsoft-credentials/status'),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJson<Settings>('/api/settings'),
  });

  const { data: ratesData } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => fetchJson<{ rates: ExchangeRate[] }>('/api/settings/exchange-rates'),
  });
  const rateByCurrency = new Map((ratesData?.rates ?? []).map((r) => [r.currency, r]));

  useEffect(() => {
    if (settings?.brandLogoUrl) setLogoPreview(settings.brandLogoUrl);
  }, [settings?.brandLogoUrl]);

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

  const saveGeneral = useMutation({
    mutationFn: (payload: { wholesaleDiscountPct: number; defaultCurrency: string }) =>
      fetchJson('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setGeneralMessage('Kaydedildi.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => setGeneralMessage(err instanceof Error ? err.message : 'Kaydetme hatası'),
  });

  const saveRate = useMutation({
    mutationFn: (payload: { currency: 'USD' | 'EUR'; ratePerTry: number }) =>
      fetchJson('/api/settings/exchange-rates', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setRateMessage('Kur kaydedildi.');
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
    onError: (err) => setRateMessage(err instanceof Error ? err.message : 'Kaydetme hatası'),
  });

  const saveLogo = useMutation({
    mutationFn: (dataUrl: string) => fetchJson('/api/settings', { method: 'PUT', body: JSON.stringify({ brandLogoUrl: dataUrl }) }),
    onSuccess: () => {
      setLogoMessage('Logo kaydedildi.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => setLogoMessage(err instanceof Error ? err.message : 'Kaydetme hatası'),
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

  function handleGeneralSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    saveGeneral.mutate({
      wholesaleDiscountPct: Number(form.get('wholesaleDiscountPct') ?? 40),
      defaultCurrency: String(form.get('defaultCurrency') ?? 'TRY'),
    });
  }

  function handleRateSubmit(currency: 'USD' | 'EUR', e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = Number(form.get(`rate-${currency}`));
    if (!value || value <= 0) return;
    saveRate.mutate({ currency, ratePerTry: value });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoMessage(null);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[40px] max-w-[520px]">
        <h1 className="text-[34px] leading-[1.08]">Ayarlar</h1>

        <section className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">İndirim ve Para Birimi</h2>
          <form onSubmit={handleGeneralSubmit} className="flex flex-col gap-[17px]">
            <label className="flex flex-col gap-[5px] text-[14px]">
              Toptan İndirim Yüzdesi
              <input
                name="wholesaleDiscountPct"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={settings?.wholesaleDiscountPct ?? 40}
                key={settings?.wholesaleDiscountPct}
                className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
              />
            </label>
            <label className="flex flex-col gap-[5px] text-[14px]">
              Varsayılan Para Birimi
              <select
                name="defaultCurrency"
                defaultValue={settings?.defaultCurrency ?? 'TRY'}
                key={settings?.defaultCurrency}
                className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <button type="submit" className="btn-ghost self-start" disabled={saveGeneral.isPending}>
              {saveGeneral.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {generalMessage && <p className="text-[14px] text-[var(--color-bark)]">{generalMessage}</p>}
          </form>
        </section>

        <section className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">Döviz Kurları</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            Kur girişi tamamen manueldir, otomatik kur API'si yok. USD/EUR kataloğu oluşturmadan önce burada kur girin.
          </p>
          {(['USD', 'EUR'] as const).map((currency) => {
            const rate = rateByCurrency.get(currency);
            return (
              <form
                key={currency}
                onSubmit={(e) => handleRateSubmit(currency, e)}
                className="flex items-end gap-[11px]"
              >
                <label className="flex flex-col gap-[5px] text-[14px] flex-1">
                  1 {currency} = ? TRY
                  <input
                    name={`rate-${currency}`}
                    type="number"
                    min={0}
                    step="0.000001"
                    placeholder={rate ? rate.ratePerTry : 'Kur girilmedi'}
                    className="border-b border-[var(--color-pebble)] bg-transparent py-[9px] text-[14px] outline-none"
                  />
                </label>
                <button type="submit" className="btn-ghost" disabled={saveRate.isPending}>
                  Kaydet
                </button>
                {rate && (
                  <span className="text-[14px] text-[var(--color-bark)] pb-[9px]">
                    Güncel: {Number(rate.ratePerTry).toFixed(4)} ({new Date(rate.effectiveAt).toLocaleDateString('tr-TR')})
                  </span>
                )}
              </form>
            );
          })}
          {rateMessage && <p className="text-[14px] text-[var(--color-bark)]">{rateMessage}</p>}
        </section>

        <section className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">Marka Logosu</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            Katalog kapak sayfasında kullanılır. Yoksa varsayılan "HE-QA" metni gösterilir.
          </p>
          {logoPreview && (
            <div className="w-[200px] h-[100px] bg-[var(--color-linen)] flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPreview} alt="Marka logosu önizleme" className="max-w-full max-h-full object-contain" />
            </div>
          )}
          <input type="file" accept="image/*" onChange={handleLogoChange} className="text-[14px]" />
          <button
            type="button"
            className="btn-ghost self-start"
            disabled={!logoPreview || saveLogo.isPending}
            onClick={() => logoPreview && saveLogo.mutate(logoPreview)}
          >
            {saveLogo.isPending ? 'Kaydediliyor…' : 'Logoyu Kaydet'}
          </button>
          {logoMessage && <p className="text-[14px] text-[var(--color-bark)]">{logoMessage}</p>}
        </section>

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
