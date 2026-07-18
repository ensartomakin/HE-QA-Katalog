import { TopNav } from '@/components/TopNav';

export default function CatalogsPage() {
  return (
    <main className="max-w-[1200px] mx-auto pb-[80px]">
      <TopNav />
      <div className="px-[17px] flex flex-col gap-[17px]">
        <h1 className="text-[34px] leading-[1.08]">Katalog Geçmişi</h1>
        <p className="text-[14px] text-[var(--color-bark)]">
          Bu ekran Faz 2'de (docs/SISTEM-TASARIMI.md §5) devreye girecek — katalog kaydetme, PDF üretimi ve geçmiş listesi.
        </p>
      </div>
    </main>
  );
}
