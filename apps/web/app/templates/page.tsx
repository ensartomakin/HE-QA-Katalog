import { CATALOG_TEMPLATES } from '@he-qa/db';
import { TopNav } from '@/components/TopNav';

export default function TemplatesPage() {
  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[34px]">
        <div>
          <h1 className="text-[34px] leading-[1.08]">Şablonlar</h1>
          <p className="text-[14px] text-[var(--color-bark)] mt-[5px]">
            Katalog oluştururken seçebileceğiniz sayfa düzenleri. Yeni şablonlar eklendikçe burada listelenir.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[25px]">
          {CATALOG_TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col gap-[11px] border border-[var(--color-pebble)] p-[15px]">
              <div
                className="w-full bg-[var(--color-linen)] flex items-center justify-center text-[12px] text-[var(--color-bark)]"
                style={{ aspectRatio: '210 / 297' }}
              >
                Önizleme yakında
              </div>
              <div>
                <span className="text-[16px] flex items-center gap-[7px]">
                  {t.name}
                  {t.isPlaceholder && (
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-bark)] border border-[var(--color-pebble)] rounded-full px-[7px] py-[1px]">
                      Geçici
                    </span>
                  )}
                </span>
                <p className="text-[13px] text-[var(--color-bark)] mt-[3px]">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
