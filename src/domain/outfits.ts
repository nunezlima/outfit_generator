// Reglas sobre outfits guardados: disponibilidad y validación.

import { CompatIndex, type PairVerdict } from './compat';
import type { Catalog, Garment, Outfit, PositionRole, UUID } from './types';

export type MissingReason = 'laundry' | 'archived' | 'deleted';

export interface OutfitAvailability {
  available: boolean;
  missing: { garmentId: UUID; name: string; reason: MissingReason }[];
}

/** Un outfit está "no disponible" si alguna prenda está en el cesto, archivada o borrada. */
export function outfitAvailability(outfit: Pick<Outfit, 'garment_ids'>, garmentsById: Map<UUID, Garment>): OutfitAvailability {
  const missing: OutfitAvailability['missing'] = [];
  for (const id of outfit.garment_ids) {
    const g = garmentsById.get(id);
    if (!g || g.deleted_at) missing.push({ garmentId: id, name: 'Prenda eliminada', reason: 'deleted' });
    else if (g.status === 'laundry') missing.push({ garmentId: id, name: g.name, reason: 'laundry' });
    else if (g.status === 'archived') missing.push({ garmentId: id, name: g.name, reason: 'archived' });
  }
  return { available: missing.length === 0, missing };
}

export const MISSING_LABEL: Record<MissingReason, string> = {
  laundry: 'en el cesto',
  archived: 'archivada',
  deleted: 'eliminada',
};

export interface OutfitWarnings {
  conflicts: { a: Garment; b: Garment; verdict: PairVerdict }[];
  /** Avisos de estructura: falta calzado, sobra una parte superior, etc. */
  structure: string[];
}

/**
 * Revisa un outfit armado a mano: pares que no combinan y huecos
 * obligatorios. No bloquea guardar; solo informa.
 */
export function validateOutfit(garments: Garment[], catalog: Catalog): OutfitWarnings {
  const compat = new CompatIndex(catalog);
  const positionOfType = new Map(catalog.types.map((t) => [t.id, catalog.positions.find((p) => p.id === t.position_id)]));
  const byRole = new Map<PositionRole, number>();
  const byPosition = new Map<UUID, number>();
  for (const g of garments) {
    const p = positionOfType.get(g.type_id);
    if (!p) continue;
    byRole.set(p.role, (byRole.get(p.role) ?? 0) + 1);
    byPosition.set(p.id, (byPosition.get(p.id) ?? 0) + 1);
  }
  const structure: string[] = [];
  const hasFull = (byRole.get('full_body') ?? 0) > 0;
  const has = (role: PositionRole) => catalog.positions.some((p) => p.role === role);
  if (!hasFull) {
    if (has('top') && !byRole.get('top') && !byRole.get('mid')) structure.push('Falta la parte superior (o una pieza completa).');
    if (has('bottom') && !byRole.get('bottom')) structure.push('Falta la parte inferior (o una pieza completa).');
  } else if (byRole.get('top') || byRole.get('bottom')) {
    structure.push('Tiene pieza completa y además parte superior o inferior.');
  }
  if (has('footwear') && !byRole.get('footwear')) structure.push('Falta el calzado.');
  for (const p of catalog.positions) {
    const n = byPosition.get(p.id) ?? 0;
    if (n > p.max_items) structure.push(`${p.name}: hay ${n} prendas y el máximo es ${p.max_items}.`);
  }
  return { conflicts: compat.conflicts(garments), structure };
}
