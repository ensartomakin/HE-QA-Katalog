'use client';

import { useMemo, useRef, useState } from 'react';
import { useOnClickOutside } from '@/lib/use-on-click-outside';
import { filterCategoryTree, flattenCategoryTree } from '@/lib/category-tree';
import type { Category } from '@/lib/types';

interface CategoryTreePickerProps {
  categories: Category[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function CategoryTreePicker({ categories, selectedIds, onChange }: CategoryTreePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const tree = useMemo(() => flattenCategoryTree(categories), [categories]);
  const visible = useMemo(() => filterCategoryTree(tree, query), [tree, query]);

  const selectedNames = categories
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.name)
    .join(', ');

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between border border-[var(--color-pebble)] px-[17px] py-[11px] text-[14px] text-left bg-[var(--color-bone-white)]"
      >
        <span className={selectedNames ? '' : 'text-[var(--color-bark)]'}>
          {selectedNames || 'Kategori seçin veya arayın…'}
        </span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-[5px] w-full max-h-[420px] overflow-y-auto border border-[var(--color-ink-black)] bg-[var(--color-bone-white)]">
          <input
            autoFocus
            type="search"
            placeholder="Kategori adı veya ID ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-b border-[var(--color-pebble)] bg-[var(--color-linen)] px-[17px] py-[11px] text-[14px] outline-none sticky top-0"
          />
          <ul>
            {visible.map((c) => (
              <li key={c.id}>
                <label
                  className="flex items-center justify-between gap-[9px] px-[17px] py-[9px] text-[14px] cursor-pointer hover:bg-[var(--color-linen)]"
                  style={{ paddingLeft: 17 + c.depth * 20 }}
                >
                  <span className="flex items-center gap-[9px] truncate">
                    {c.depth > 0 && <span aria-hidden className="text-[var(--color-bark)]">└</span>}
                    {c.name}
                  </span>
                  <span className="flex items-center gap-[9px] shrink-0">
                    <span className="text-[var(--color-bark)]">#{c.tsoftCategoryId}</span>
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggle(c.id)} />
                  </span>
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="px-[17px] py-[11px] text-[14px] text-[var(--color-bark)]">Kategori bulunamadı</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
