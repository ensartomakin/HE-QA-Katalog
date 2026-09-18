'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Ürün Seçim Paneli' },
  { href: '/catalogs', label: 'Katalog Geçmişi' },
  { href: '/templates', label: 'Şablonlar' },
  { href: '/sync', label: 'Senkronizasyon' },
  { href: '/settings', label: 'Ayarlar' },
  { href: '/users', label: 'Kullanıcılar' },
];

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between py-[17px] px-[17px] max-w-[1200px] mx-auto">
      <span className="font-medium text-[21px]">HE-QA</span>
      <nav className="flex items-center gap-[20px]">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="text-[14px] hover:underline underline-offset-4"
              style={
                active
                  ? { textDecoration: 'underline', textDecorationColor: 'var(--color-neon-yellow)', textDecorationThickness: '3px', fontWeight: 500 }
                  : undefined
              }
            >
              {l.label}
            </Link>
          );
        })}
        <button type="button" onClick={handleLogout} className="text-[14px] hover:underline">
          Çıkış Yap
        </button>
      </nav>
    </header>
  );
}
