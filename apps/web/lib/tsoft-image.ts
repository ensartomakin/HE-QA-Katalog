/** T-Soft'tan senkronize edilen görsel URL'leri "-K" (küçük, ör. 134x200px) sonekiyle
 *  geliyor (bkz. apps/worker/src/services/tsoft-client.ts) — katalog PDF'inde büyük
 *  gösterildiğinde bulanıklaşıyordu. Mağaza CDN'i aynı dosya adında "-O" (orta, ~470x700)
 *  ve "-B" (büyük, ~3072x4578) varyantlarını da sunuyor (doğrulandı). Depolanan URL'yi
 *  değiştirmeden, sadece render anında daha büyük varyantı istiyoruz.
 *  Not: eşleşen "-K" soneki bulunamazsa (beklenmedik bir dosya adı deseni) URL olduğu
 *  gibi döner — kırık görsel yerine mevcut (küçük) görsel gösterilir. */
export function upsizeTsoftImageUrl(url: string, size: 'O' | 'B'): string {
  return url.replace(/-K(\.\w+)$/i, `-${size}$1`);
}
