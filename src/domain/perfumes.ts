// ═══════════════════════════════════════════════════════════════════════════
// PERFUME DEL OUTFIT
//
// El perfume depende de la ocasión y del clima DEL PERFUME (calor, templado,
// frío), que es independiente del clima de la ropa (sol, lluvia, frío): un día
// de sol en diciembre sigue pidiendo un perfume de frío.
//
//   · Clima sugerido según el mes: calor de marzo a junio, templado de julio a
//     octubre y frío de noviembre a febrero. Tú lo cambias con un toque.
//   · Con ocasión: primero el principal (el primero de la lista); "regenerar"
//     pasa a los secundarios, en orden, y vuelve al principal.
//   · Si la ocasión no tiene perfume para ese clima, se usa el clima más
//     cercano que sí tenga (y se avisa).
//   · Sin ocasión ("Todo"): uno al azar.
//   · Los perfumes archivados no se sugieren.
//
// Lógica pura: sin React ni base de datos.
// ═══════════════════════════════════════════════════════════════════════════

import { defaultRng, type Rng } from './random';
import type { Occasion, Perfume, PerfumeClimate, UUID } from './types';

export const PERFUME_CLIMATES: PerfumeClimate[] = ['hot', 'mild', 'cold'];

/** Si no hay perfume para un clima, se prueba en este orden. */
const FALLBACK: Record<PerfumeClimate, PerfumeClimate[]> = {
  hot: ['mild', 'cold'],
  mild: ['cold', 'hot'],
  cold: ['mild', 'hot'],
};

/** Clima de perfume que corresponde a la fecha (mes local). */
export function climateForDate(date: Date = new Date()): PerfumeClimate {
  const m = date.getMonth(); // 0 = enero
  if (m >= 2 && m <= 5) return 'hot'; // marzo–junio
  if (m >= 6 && m <= 9) return 'mild'; // julio–octubre
  return 'cold'; // noviembre–febrero
}

/** Columna de la ocasión para un clima. */
export function perfumeColumn(climate: PerfumeClimate): 'perfumes_hot' | 'perfumes_mild' | 'perfumes_cold' {
  return climate === 'hot' ? 'perfumes_hot' : climate === 'mild' ? 'perfumes_mild' : 'perfumes_cold';
}

/** Perfumes de la ocasión para ese clima, en orden (sin duplicados). */
export function perfumeIdsFor(occasion: Occasion, climate: PerfumeClimate): UUID[] {
  return [...new Set(occasion[perfumeColumn(climate)] ?? [])];
}

export interface PerfumePick {
  perfumeId: UUID;
  /** Clima del que salió (puede ser otro si el pedido no tenía perfumes). */
  climate: PerfumeClimate;
  /** Clima que se pidió. */
  requested: PerfumeClimate;
  /** 0 = principal, 1+ = secundarios. -1 = al azar (sin ocasión). */
  rank: number;
  /** Cuántos perfumes hay para elegir en esa lista. */
  count: number;
}

export interface PerfumeContext {
  occasion: Occasion | null;
  /** Todas las ocasiones (para el azar sin ocasión). */
  occasions: Occasion[];
  perfumes: Perfume[];
  rng?: Rng;
}

const usable = (perfumes: Perfume[]) => new Map(perfumes.filter((p) => !p.deleted_at && p.status === 'available').map((p) => [p.id, p]));

/** Lista utilizable (existen y no están archivados) de la ocasión para un clima. */
function listFor(occasion: Occasion, climate: PerfumeClimate, ok: Map<UUID, Perfume>): UUID[] {
  return perfumeIdsFor(occasion, climate).filter((id) => ok.has(id));
}

/** Pool para el azar sin ocasión: los asignados a ese clima en cualquier ocasión; si no hay, todos. */
function randomPool(ctx: PerfumeContext, climate: PerfumeClimate, ok: Map<UUID, Perfume>): UUID[] {
  const assigned = new Set<UUID>();
  for (const o of ctx.occasions) if (!o.deleted_at) for (const id of perfumeIdsFor(o, climate)) if (ok.has(id)) assigned.add(id);
  return assigned.size > 0 ? [...assigned] : [...ok.keys()];
}

function pickRandom(pool: UUID[], avoid: UUID | null, rng: Rng): UUID | null {
  const options = pool.length > 1 && avoid ? pool.filter((id) => id !== avoid) : pool;
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)] ?? options[0];
}

/**
 * Perfume sugerido: el principal de la ocasión para ese clima (o del clima
 * más cercano que tenga), o uno al azar si no hay ocasión. null si no hay
 * ningún perfume que sugerir.
 */
export function suggestPerfume(ctx: PerfumeContext, climate: PerfumeClimate): PerfumePick | null {
  const ok = usable(ctx.perfumes);
  if (ok.size === 0) return null;
  if (ctx.occasion) {
    for (const c of [climate, ...FALLBACK[climate]]) {
      const list = listFor(ctx.occasion, c, ok);
      if (list.length > 0) return { perfumeId: list[0], climate: c, requested: climate, rank: 0, count: list.length };
    }
    return null;
  }
  const pool = randomPool(ctx, climate, ok);
  const id = pickRandom(pool, null, ctx.rng ?? defaultRng);
  return id ? { perfumeId: id, climate, requested: climate, rank: -1, count: pool.length } : null;
}

/**
 * "Regenerar" el perfume: el siguiente de la misma lista (secundarios en
 * orden, luego vuelve al principal), u otro al azar si no hay ocasión.
 * Devuelve null si no hay otra opción.
 */
export function nextPerfume(ctx: PerfumeContext, current: PerfumePick): PerfumePick | null {
  const ok = usable(ctx.perfumes);
  if (ctx.occasion) {
    const list = listFor(ctx.occasion, current.climate, ok);
    if (list.length === 0) return suggestPerfume(ctx, current.requested);
    const at = list.indexOf(current.perfumeId);
    const next = list[(at + 1) % list.length];
    if (next === current.perfumeId) return null;
    return { ...current, perfumeId: next, rank: list.indexOf(next), count: list.length };
  }
  const pool = randomPool(ctx, current.requested, ok);
  const id = pickRandom(pool, current.perfumeId, ctx.rng ?? defaultRng);
  if (!id || id === current.perfumeId) return null;
  return { ...current, perfumeId: id, rank: -1, count: pool.length };
}

/** ¿Hay otra opción a la cual pasar con "regenerar"? */
export function hasAlternative(ctx: PerfumeContext, current: PerfumePick): boolean {
  const ok = usable(ctx.perfumes);
  if (ctx.occasion) return listFor(ctx.occasion, current.climate, ok).filter((id) => id !== current.perfumeId).length > 0;
  return randomPool(ctx, current.requested, ok).some((id) => id !== current.perfumeId);
}

/** ¿La ocasión tiene algún perfume utilizable para este clima (sin contar el respaldo)? */
export function climateHasPerfumes(ctx: PerfumeContext, climate: PerfumeClimate): boolean {
  const ok = usable(ctx.perfumes);
  if (!ctx.occasion) return randomPool(ctx, climate, ok).length > 0;
  return listFor(ctx.occasion, climate, ok).length > 0;
}

/** Etiqueta corta del rol: "Principal", "Secundario", "Secundario 2 de 3", "Al azar". */
export function rankLabel(pick: Pick<PerfumePick, 'rank' | 'count'>): string {
  if (pick.rank < 0) return 'Al azar';
  if (pick.rank === 0) return 'Principal';
  const secondaries = pick.count - 1;
  return secondaries > 1 ? `Secundario ${pick.rank} de ${secondaries}` : 'Secundario';
}

/** Quita un perfume de todas las listas de una ocasión (al borrarlo). */
export function withoutPerfume(occasion: Occasion, perfumeId: UUID): Occasion {
  return {
    ...occasion,
    perfumes_hot: occasion.perfumes_hot.filter((id) => id !== perfumeId),
    perfumes_mild: occasion.perfumes_mild.filter((id) => id !== perfumeId),
    perfumes_cold: occasion.perfumes_cold.filter((id) => id !== perfumeId),
  };
}

/** ¿En cuántas listas (ocasión × clima) aparece un perfume? */
export function perfumeUseCount(occasions: Occasion[], perfumeId: UUID): number {
  let n = 0;
  for (const o of occasions) for (const c of PERFUME_CLIMATES) if (perfumeIdsFor(o, c).includes(perfumeId)) n++;
  return n;
}
