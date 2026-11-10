import { create } from 'zustand';

import { initialDesign, storeDesign, type Design } from '../lib/design';

interface DesignState {
  design: Design;
  /** Applies at once and is remembered on this device (ui-redesign.md §4). */
  setDesign: (design: Design) => void;
}

/** Which look this device shows — docs/features/ui-redesign.md §4. */
export const useDesignStore = create<DesignState>()((set) => ({
  design: initialDesign(typeof window === 'undefined' ? '' : window.location.search),
  setDesign: (design) => {
    storeDesign(design);
    set({ design });
  },
}));

/** True under Mixtape: components that change structure switch on this. */
export function useMixtape(): boolean {
  return useDesignStore((state) => state.design === 'mixtape');
}
