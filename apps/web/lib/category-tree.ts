import type { Category } from './types';

export interface CategoryTreeNode extends Category {
  depth: number;
}

/** Kategorileri ebeveyn→çocuk sırasında (DFS), girinti seviyesiyle birlikte düzleştirir. */
export function flattenCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const result: CategoryTreeNode[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const c of byParent.get(parentId) ?? []) {
      result.push({ ...c, depth });
      visit(c.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

/** Arama sırasında eşleşen kategoriyle birlikte tüm ebeveynlerini de gösterir (bağlam korunur). */
export function filterCategoryTree(tree: CategoryTreeNode[], query: string): CategoryTreeNode[] {
  if (!query.trim()) return tree;
  const q = query.toLocaleLowerCase('tr-TR');
  const byId = new Map(tree.map((c) => [c.id, c]));
  const keep = new Set<string>();

  for (const c of tree) {
    const matches = c.name.toLocaleLowerCase('tr-TR').includes(q) || c.tsoftCategoryId.includes(q);
    if (!matches) continue;
    keep.add(c.id);
    let current = c;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      keep.add(parent.id);
      current = parent;
    }
  }

  return tree.filter((c) => keep.has(c.id));
}
