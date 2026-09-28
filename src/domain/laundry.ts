// Cesto de ropa sucia: reglas puras sobre una prenda.

import type { Garment } from './types';

export interface WearOutcome {
  garment: Garment;
  /** true si con este uso llegó a su límite y pasó al cesto. */
  movedToLaundry: boolean;
}

/**
 * Suma un uso. Si llega a `wash_after_uses` (y este es > 0), pasa al cesto.
 * `wash_after_uses = 0` significa "nunca va al cesto automáticamente".
 */
export function applyWear(g: Garment): WearOutcome {
  const uses = g.uses_since_wash + 1;
  const reachesLimit = g.wash_after_uses > 0 && uses >= g.wash_after_uses;
  const movedToLaundry = reachesLimit && g.status === 'available';
  return {
    garment: { ...g, uses_since_wash: uses, status: movedToLaundry ? 'laundry' : g.status },
    movedToLaundry,
  };
}

/** "Lavado / listo para usar": vuelve a disponible con el contador en cero. */
export function applyWash(g: Garment): Garment {
  return { ...g, status: g.status === 'archived' ? 'archived' : 'available', uses_since_wash: 0 };
}

/** Mandar al cesto manualmente. */
export function sendToLaundry(g: Garment): Garment {
  return { ...g, status: 'laundry' };
}

/** Usos restantes antes de ir al cesto (null = nunca va). */
export function usesLeft(g: Garment): number | null {
  if (g.wash_after_uses <= 0) return null;
  return Math.max(0, g.wash_after_uses - g.uses_since_wash);
}
