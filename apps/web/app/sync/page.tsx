'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopNav } from '@/components/TopNav';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız: ${url}`);
  return body;
}

interface BulkTranslateStatus {
  running: boolean;
  remaining: number | null;
  error: string | null;
  done: boolean;
}

const BULK_TRANSLATE_POLL_DELAY_MS = 5000;

// Ürün başına Gemini kotasına (bkz. worker translation.service.ts) tek istekte çarpmamak için
// her turda küçük bir grup (worker'daki BULK_BATCH_SIZE) çevrilip `remaining` sıfıra inene
// kadar bekleyip tekrar çağrılıyor — sayfa açık kaldığı sürece otomatik ilerler, kapatılırsa
// kaldığı yerden (DB'de zaten çevrilmiş olanlar tekrar denenmediği için) güvenle devam eder.
function useBulkTranslate(language: 'EN' | 'AR') {
  const [status, setStatus] = useState<BulkTranslateStatus>({ running: false, remaining: null, error: null, done: false });
  const stopRef = useRef(false);

  async function start() {
    stopRef.current = false;
    setStatus({ running: true, remaining: null, error: null, done: false });
    while (!stopRef.current) {
      try {
        const res = await fetchJson<{ processed: number; remaining: number }>('/api/products/translate-batch', {
          method: 'POST',
          body: JSON.stringify({ language }),
        });
        if (stopRef.current) return;
        if (res.remaining === 0) {
          setStatus({ running: false, remaining: 0, error: null, done: true });
          return;
        }
        setStatus((prev) => ({ ...prev, remaining: res.remaining }));
      } catch (err) {
        setStatus((prev) => ({ ...prev, running: false, error: err instanceof Error ? err.message : 'Bilinmeyen hata' }));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, BULK_TRANSLATE_POLL_DELAY_MS));
    }
    setStatus((prev) => ({ ...prev, running: false }));
  }

  function stop() {
    stopRef.current = true;
    setStatus((prev) => ({ ...prev, running: false }));
  }

  return { status, start, stop };
}

function BulkTranslateCard({
  title,
  status,
  onStart,
  onStop,
}: {
  title: string;
  status: BulkTranslateStatus;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col gap-[9px] border border-[var(--color-pebble)] p-[17px] flex-1">
      <div className="flex items-center justify-between">
        <span className="text-[14px]">{title}</span>
        <button type="button" className="btn-ghost text-[12px]" onClick={status.running ? onStop : onStart}>
          {status.running ? 'Durdur' : 'Başlat'}
        </button>
      </div>
      <p className="text-[12px] text-[var(--color-bark)]">
        {status.error
          ? status.error
          : status.done
            ? 'Tamamlandı — çevrilmemiş ürün kalmadı.'
            : status.remaining !== null
              ? `${status.running ? 'Çevriliyor…' : 'Duraklatıldı.'} Kalan: ${status.remaining} ürün`
              : status.running
                ? 'Başlatılıyor…'
                : 'Henüz başlatılmadı.'}
      </p>
    </div>
  );
}

interface SyncRun {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  method: string;
  startedAt: string;
  finishedAt: string | null;
  productsUpserted: number;
  productsMissing: number;
  errorMessage: string | null;
}

interface MissingProduct {
  id: string;
  name: string;
  code: string;
  sourceMissingSince: string | null;
  missingSyncCount: number;
  archivedAt: string | null;
}

const MISSING_THRESHOLD = 3;

export default function SyncPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [salesMessage, setSalesMessage] = useState<string | null>(null);
  const enTranslate = useBulkTranslate('EN');
  const arTranslate = useBulkTranslate('AR');

  const { data } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetchJson<{ runs: SyncRun[] }>('/api/sync/history'),
  });

  const { data: missingData } = useQuery({
    queryKey: ['missing-products'],
    queryFn: () => fetchJson<{ products: MissingProduct[] }>('/api/sync/missing-products'),
  });

  const runSync = useMutation({
    mutationFn: () => fetchJson('/api/sync/run', { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['missing-products'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bilinmeyen hata'),
  });

  const runSalesPerformance = useMutation({
    mutationFn: () => fetchJson<{ updated: number; matched: number }>('/api/sync/sales-performance', { method: 'POST' }),
    onSuccess: (res) => {
      setSalesMessage(`${res.matched} ürün için satış performansı güncellendi.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => setSalesMessage(err instanceof Error ? err.message : 'Bilinmeyen hata'),
  });

  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[40px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] leading-[1.08]">Senkronizasyon Yönetimi</h1>
          <div className="flex gap-[11px]">
            <button type="button" className="btn-ghost" onClick={() => runSalesPerformance.mutate()} disabled={runSalesPerformance.isPending}>
              {runSalesPerformance.isPending ? 'Güncelleniyor…' : '→ Satış Performansını Güncelle (Son 30 Gün)'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => runSync.mutate()} disabled={runSync.isPending}>
              {runSync.isPending ? 'Senkronize ediliyor…' : '→ Şimdi Senkronize Et'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-[25px]">
          <p className="text-[14px] text-[var(--color-bark)]">
            Senkron yalnızca bu buton ile manuel tetiklenir — stok ve ürün verisi otomatik/gerçek zamanlı güncellenmez (netleşti).
          </p>

          {error && <p className="text-[14px] text-red-700">{error}</p>}
          {salesMessage && <p className="text-[14px] text-[var(--color-bark)]">{salesMessage}</p>}

          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-pebble)] text-left">
                <th className="py-[9px] font-medium">Başlangıç</th>
                <th className="py-[9px] font-medium">Durum</th>
                <th className="py-[9px] font-medium">Güncellenen</th>
                <th className="py-[9px] font-medium">Kaynakta Bulunamayan</th>
              </tr>
            </thead>
            <tbody>
              {(data?.runs ?? []).map((run) => (
                <tr key={run.id} className="border-b border-[var(--color-pebble)]">
                  <td className="py-[9px]">{new Date(run.startedAt).toLocaleString('tr-TR')}</td>
                  <td className="py-[9px]">{run.status}</td>
                  <td className="py-[9px]">{run.productsUpserted}</td>
                  <td className="py-[9px]">{run.productsMissing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">Toplu Çeviri</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            Henüz İngilizce/Arapça alanları boş olan ürünleri arka planda parça parça çevirip veritabanına kaydeder
            — bir sonraki katalog üretiminde tekrar çevrilmeleri gerekmez. Başlatıldıktan sonra sayfa açık kaldığı
            sürece otomatik ilerler; kapatıp daha sonra devam ettirebilirsiniz.
          </p>
          <div className="flex gap-[17px]">
            <BulkTranslateCard title="İngilizce" status={enTranslate.status} onStart={enTranslate.start} onStop={enTranslate.stop} />
            <BulkTranslateCard title="Arapça" status={arTranslate.status} onStart={arTranslate.start} onStop={arTranslate.stop} />
          </div>
        </div>

        <div className="flex flex-col gap-[17px]">
          <h2 className="text-[21px]">İncelenmesi Gereken Ürünler</h2>
          <p className="text-[14px] text-[var(--color-bark)]">
            Son senkronlarda tsoft kaynağında bulunamayan ürünler — {MISSING_THRESHOLD} ardışık senkrondan sonra otomatik arşivlenir.
          </p>
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-pebble)] text-left">
                <th className="py-[9px] font-medium">Ürün</th>
                <th className="py-[9px] font-medium">Kod</th>
                <th className="py-[9px] font-medium">Kaynakta Kayıp Tarihi</th>
                <th className="py-[9px] font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {(missingData?.products ?? []).map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-pebble)]">
                  <td className="py-[9px]">{p.name}</td>
                  <td className="py-[9px]">{p.code}</td>
                  <td className="py-[9px]">{p.sourceMissingSince ? new Date(p.sourceMissingSince).toLocaleDateString('tr-TR') : '—'}</td>
                  <td className="py-[9px]">
                    {p.archivedAt ? 'Arşivlendi' : `İzleniyor (${p.missingSyncCount}/${MISSING_THRESHOLD})`}
                  </td>
                </tr>
              ))}
              {(missingData?.products ?? []).length === 0 && (
                <tr>
                  <td className="py-[9px] text-[var(--color-bark)]" colSpan={4}>
                    İncelenmesi gereken ürün yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
