import { create } from 'zustand';

interface CatalogSelectionState {
  selectedIds: Set<string>;
  toggle: (productId: string) => void;
  clear: () => void;
  isSelected: (productId: string) => boolean;
}

export const useCatalogSelection = create<CatalogSelectionState>((set, get) => ({
  selectedIds: new Set(),
  toggle: (productId) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return { selectedIds: next };
    }),
  clear: () => set({ selectedIds: new Set() }),
  isSelected: (productId) => get().selectedIds.has(productId),
}));
