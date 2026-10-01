// Edición masiva de prendas (lógica pura): agregar o quitar estilos y
// cambiar tipo, clima, abrigo o estado. Lo que no se elige no cambia.

import type { Climate, Garment, GarmentStatus, UUID, Warmth } from './types';

export type StyleAction = 'add' | 'remove' | null;

export interface BulkChanges {
  styles: Record<UUID, StyleAction>;
  typeId: UUID | null;
  climate: Climate | null;
  warmth: Warmth | null;
  status: GarmentStatus | null;
}

/** Aplica los cambios a una prenda; devuelve null si no cambia nada. */
export function applyBulkChanges(g: Garment, c: BulkChanges): Garment | null {
  const add = Object.entries(c.styles).filter(([, a]) => a === 'add').map(([id]) => id);
  const remove = new Set(Object.entries(c.styles).filter(([, a]) => a === 'remove').map(([id]) => id));
  const styleIds = [...g.style_ids.filter((id) => !remove.has(id)), ...add.filter((id) => !g.style_ids.includes(id))];
  const next: Garment = {
    ...g,
    style_ids: styleIds,
    type_id: c.typeId ?? g.type_id,
    climate: c.climate ?? g.climate ?? 'all',
    warmth: c.warmth ?? g.warmth,
    status: c.status ?? g.status,
  };
  const same =
    next.type_id === g.type_id &&
    next.climate === (g.climate ?? 'all') &&
    next.warmth === g.warmth &&
    next.status === g.status &&
    next.style_ids.length === g.style_ids.length &&
    next.style_ids.every((id) => g.style_ids.includes(id));
  return same ? null : next;
}
