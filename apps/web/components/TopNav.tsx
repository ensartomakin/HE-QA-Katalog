import Link from 'next/link';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Ürün Seçim Paneli' },
  { href: '/catalogs', label: 'Katalog Geçmişi' },
  { href: '/sync', label: 'Senkronizasyon' },
  { href: '/settings', label: 'Ayarlar' },
];

export function TopNav() {
  return (
    <header className="flex items-center justify-between py-[17px] px-[17px] max-w-[1200px] mx-auto">
      <span className="font-medium text-[21px]">HE-QA</span>
      <nav className="flex gap-[20px]">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-[14px] hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
