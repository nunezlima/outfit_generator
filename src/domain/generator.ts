// ═══════════════════════════════════════════════════════════════════════════
// GENERADOR DE OUTFITS
//
// Pasos (detalle en docs/DISENO.md §6):
//   1. Filtrar candidatas por posición, guardando POR QUÉ se descarta cada
//      prenda (cesto, archivada, deseleccionada, estilo objetivo, clima).
//   2. Elegir la estructura: superior + inferior, o pieza completa.
//   3. Decidir las capas del torso (ligera, intermedia o ambas) y qué
//      opcionales entran (capa exterior según clima, extras, accesorios).
//   4. Búsqueda con retroceso: llenar posiciones (primero las más difíciles)
//      probando candidatas en orden aleatorio PONDERADO; si una elección deja
//      sin salida a una posición obligatoria posterior, se deshace y se prueba
//      la siguiente.
//   5. Si nada funciona, diagnosticar qué restricción lo impide.
//
// Todo es lógica pura: recibe datos y un RNG, no toca red ni interfaz.
// ═══════════════════════════════════════════════════════════════════════════

import type { GarmentUsage } from './analysis';
import { colorAdvice, colorsClash, type ColorAdvice } from './colors';
import { CompatIndex, type PairVerdict } from './compat';
import { daysBetween } from './dates';
import { defaultRng, weightedPick, weightedShuffle, type Rng } from './random';
import {
  WEATHER_LABELS,
  type Catalog,
  type Climate,
  type Garment,
  type GeneratorFilters,
  type Position,
  type PositionRole,
  type UUID,
  type Weather,
} from './types';

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ExclusionReason =
  | 'laundry'
  | 'archived'
  | 'excluded_garment'
  | 'excluded_type'
  | 'excluded_style'
  | 'target_style'
  | 'weather';

export interface GeneratorContext {
  /** Prendas no borradas (el generador filtra por estado). */
  garments: Garment[];
  catalog: Catalog;
  filters: GeneratorFilters;
  /** Estadísticas de uso para ponderar (rotación). Opcional. */
  usage?: Map<UUID, GarmentUsage>;
  now?: Date;
  rng?: Rng;
}

export interface OutfitItem {
  positionId: UUID;
  garmentId: UUID;
}

export interface GenerationFailure {
  ok: false;
  /** Frase principal, p. ej. "No hay calzado disponible con estilo Formal." */
  message: string;
  /** Detalles concretos (conteos, reglas que bloquean). */
  details: string[];
  /** Qué puedes hacer para destrabarlo. */
  hints: string[];
}

export interface GenerationSuccess {
  ok: true;
  items: OutfitItem[];
  /** Avisos que no impiden generar (p. ej. no hubo capa exterior para el frío). */
  notes: string[];
  advice: ColorAdvice;
}

export type GenerationResult = GenerationSuccess | GenerationFailure;

export interface GenerateOptions {
  /** Prendas fijadas o bloqueadas: siempre se incluyen. */
  pinnedIds?: UUID[];
  /** Outfit anterior: se desfavorece para que "regenerar" traiga algo distinto. */
  previousIds?: UUID[];
}

// ─── Reglas fijas ───────────────────────────────────────────────────────────

/** Posiciones que forman "parte superior + parte inferior". */
const CORE_ROLES: PositionRole[] = ['top', 'mid', 'bottom'];
const MAX_SEARCH_STEPS = 20_000;
/** Si entra la capa intermedia, probabilidad de que vaya sola (sin prenda ligera debajo). */
const MID_ALONE_CHANCE = 0.35;

/**
 * ¿Esta prenda sirve para el clima del día?
 *   calor    → prendas de calor y de todo el año
 *   templado → solo prendas de todo el año
 *   frío     → prendas de frío y de todo el año
 * Filas antiguas sin clima cuentan como "todo el año".
 */
export function weatherAllows(climate: Climate | null | undefined, weather: Weather | null): boolean {
  const c = climate ?? 'all';
  switch (weather) {
    case 'hot':
      return c !== 'cold';
    case 'mild':
      return c === 'all';
    case 'cold':
      return c !== 'hot';
    default:
      return true;
  }
}

/** Probabilidad de incluir una posición opcional de una sola prenda. */
function optionalChance(role: PositionRole, weather: Weather | null): number {
  if (role === 'outer') {
    if (weather === 'cold') return 1;
    if (weather === 'mild') return 0.5;
    if (weather === 'hot') return 0;
    return 0.35;
  }
  if (role === 'mid') {
    if (weather === 'cold') return 0.85;
    if (weather === 'mild') return 0.4;
    if (weather === 'hot') return 0;
    return 0.35;
  }
  if (role === 'extra') return 0.35;
  return 0;
}

/** Cuántos accesorios: 30 % ninguno, el resto repartido entre 1 y max. */
function accessoryCount(max: number, rng: Rng): number {
  if (max <= 0 || rng() < 0.3) return 0;
  return 1 + Math.floor(rng() * max);
}

// ─── Pesos (rotación del guardarropa) ───────────────────────────────────────

/**
 * Peso de "recencia" según días desde el último uso:
 *   recencia(d) = 0.2 + 1.1 · (1 − e^(−d/10))
 * usada hoy → 0.2 · hace 3 días → ~0.49 · hace 1 semana → ~0.65
 * hace 2 semanas → ~0.93 · hace 1 mes → ~1.25 · nunca usada → 1.3
 * Es proporcional, no un corte: lo reciente sigue pudiendo salir.
 */
export function recencyWeight(daysSinceWorn: number | null): number {
  if (daysSinceWorn === null) return 1.3;
  const d = Math.max(0, daysSinceWorn);
  return 0.2 + 1.1 * (1 - Math.exp(-d / 10));
}

// ─── Preparación: candidatas por posición ───────────────────────────────────

interface Prepared {
  ctx: GeneratorContext;
  rng: Rng;
  now: Date;
  compat: CompatIndex;
  positions: Position[];
  positionById: Map<UUID, Position>;
  positionOfGarment: Map<UUID, Position>;
  garmentById: Map<UUID, Garment>;
  /** Prendas que pasan todos los filtros, por posición. */
  eligible: Map<UUID, Garment[]>;
  /** Cuántas se descartaron por cada motivo, por posición. */
  excluded: Map<UUID, Partial<Record<ExclusionReason, number>>>;
  /** Total de prendas (no borradas) de cada posición. */
  total: Map<UUID, number>;
}

function exclusionReason(g: Garment, filters: GeneratorFilters, compat: CompatIndex): ExclusionReason | null {
  if (g.status === 'archived') return 'archived';
  if (g.status === 'laundry') return 'laundry';
  if (filters.excludedGarmentIds.includes(g.id)) return 'excluded_garment';
  if (filters.excludedTypeIds.includes(g.type_id)) return 'excluded_type';
  const effective = compat.effectiveStyles(g);
  if (compat.knownStyles(g).length > 0 && effective.length === 0) return 'excluded_style';
  if (filters.targetStyleId && effective.length > 0 && !effective.includes(filters.targetStyleId)) return 'target_style';
  if (!weatherAllows(g.climate, filters.weather)) return 'weather';
  return null;
}

function prepare(ctx: GeneratorContext): Prepared {
  const compat = new CompatIndex(ctx.catalog, { excludedStyleIds: ctx.filters.excludedStyleIds });
  const positions = [...ctx.catalog.positions].sort((a, b) => a.sort_order - b.sort_order);
  const positionById = new Map(positions.map((p) => [p.id, p]));
  const typePosition = new Map<UUID, Position>();
  for (const t of ctx.catalog.types) {
    const p = positionById.get(t.position_id);
    if (p) typePosition.set(t.id, p);
  }
  const eligible = new Map<UUID, Garment[]>(positions.map((p) => [p.id, []]));
  const excluded = new Map<UUID, Partial<Record<ExclusionReason, number>>>(positions.map((p) => [p.id, {}]));
  const total = new Map<UUID, number>(positions.map((p) => [p.id, 0]));
  const positionOfGarment = new Map<UUID, Position>();
  const garmentById = new Map<UUID, Garment>();

  for (const g of ctx.garments) {
    if (g.deleted_at) continue;
    garmentById.set(g.id, g);
    const pos = typePosition.get(g.type_id);
    if (!pos) continue;
    positionOfGarment.set(g.id, pos);
    total.set(pos.id, (total.get(pos.id) ?? 0) + 1);
    const reason = exclusionReason(g, ctx.filters, compat);
    if (reason) {
      const counts = excluded.get(pos.id)!;
      counts[reason] = (counts[reason] ?? 0) + 1;
    } else {
      eligible.get(pos.id)!.push(g);
    }
  }

  return {
    ctx,
    rng: ctx.rng ?? defaultRng,
    now: ctx.now ?? new Date(),
    compat,
    positions,
    positionById,
    positionOfGarment,
    garmentById,
    eligible,
    excluded,
    total,
  };
}

/** Peso final de una candidata, dado lo ya elegido. */
function weightOf(prep: Prepared, g: Garment, chosen: Garment[], previous: Set<UUID>): number {
  const usage = prep.ctx.usage?.get(g.id);
  const days = usage?.lastWornEver ? daysBetween(usage.lastWornEver, prep.now) : null;
  // Solo cuenta lo que de verdad te pones: cambiar una prenda en el generador
  // no significa que la evites (quizá no combinaba), así que no la castiga.
  let w = recencyWeight(days);
  if (previous.has(g.id)) w *= 0.35; // que "regenerar" cambie de verdad
  if (chosen.some((c) => colorsClash(c.color, g.color))) w *= 0.75; // sugerencia suave de color
  return w;
}

// ─── Estructura y huecos a llenar ──────────────────────────────────────────

interface Slot {
  position: Position;
  required: boolean;
}

type Structure = 'separates' | 'full' | 'none';

const STRUCTURE_LABEL: Record<Structure, string> = {
  separates: 'parte superior + parte inferior',
  full: 'pieza completa',
  none: 'calzado',
};

function positionsWithRole(prep: Prepared, ...roles: PositionRole[]): Position[] {
  return prep.positions.filter((p) => roles.includes(p.role));
}

// ─── API: generar un outfit completo ───────────────────────────────────────

export function generateOutfit(ctx: GeneratorContext, options: GenerateOptions = {}): GenerationResult {
  const prep = prepare(ctx);
  const { rng } = prep;
  const notes: string[] = [];
  const previous = new Set(options.previousIds ?? []);

  // ── Prendas fijadas: deben existir y estar disponibles ──
  const pins: Garment[] = [];
  const pinsByPosition = new Map<UUID, Garment[]>();
  for (const id of options.pinnedIds ?? []) {
    const g = prep.garmentById.get(id);
    const pos = g ? prep.positionOfGarment.get(g.id) : undefined;
    if (!g || !pos) continue;
    if (g.status !== 'available') {
      notes.push(`“${g.name}” está ${g.status === 'laundry' ? 'en el cesto' : 'archivada'}; no se pudo fijar.`);
      continue;
    }
    const list = pinsByPosition.get(pos.id) ?? [];
    if (list.length >= pos.max_items || list.some((x) => x.type_id === g.type_id && pos.max_items > 1)) {
      notes.push(`No cabe “${g.name}” en ${pos.name.toLowerCase()}; se ignoró.`);
      continue;
    }
    list.push(g);
    pinsByPosition.set(pos.id, list);
    pins.push(g);
  }

  const pinConflict = prep.compat.firstConflict(pins);
  if (pinConflict) {
    return {
      ok: false,
      message: `Las prendas fijadas “${pinConflict.a.name}” y “${pinConflict.b.name}” no combinan entre sí.`,
      details: [pinConflict.verdict.reason],
      hints: ['Desfija una de las dos, o crea una excepción desde la ficha de la prenda si sí quieres combinarlas.'],
    };
  }

  const core = positionsWithRole(prep, ...CORE_ROLES);
  const fulls = positionsWithRole(prep, 'full_body');
  const pinnedFull = fulls.filter((p) => pinsByPosition.has(p.id));
  // La capa intermedia puede ir sobre una pieza completa; no cuenta como conflicto.
  const pinnedCore = core.filter((p) => p.role !== 'mid' && pinsByPosition.has(p.id));

  if (pinnedFull.length > 0 && pinnedCore.length > 0) {
    return {
      ok: false,
      message: 'Fijaste una pieza completa y también una parte superior o inferior.',
      details: ['La pieza completa sustituye a la parte superior y a la inferior.'],
      hints: ['Desfija la pieza completa o las otras prendas.'],
    };
  }

  // ── Qué estructuras son posibles y en qué orden probarlas ──
  const count = (p: Position) => (pinsByPosition.get(p.id)?.length ?? 0) + prep.eligible.get(p.id)!.length;
  // Torso = parte superior o capa intermedia (cualquiera basta); cada inferior es obligatoria.
  const torso = core.filter((p) => p.role !== 'bottom');
  const bottoms = core.filter((p) => p.role === 'bottom');
  const torsoCount = torso.reduce((s, p) => s + count(p), 0);
  const coreCounts = [...bottoms.map(count), ...(torso.length > 0 ? [torsoCount] : [])];
  const separatesFeasible = coreCounts.length > 0 && coreCounts.every((n) => n > 0);
  const fullCandidates = fulls.filter((p) => count(p) > 0);
  let order: Structure[];
  if (core.length === 0 && fulls.length === 0) order = ['none'];
  else if (pinnedFull.length > 0) order = ['full'];
  else if (pinnedCore.length > 0) order = ['separates'];
  else {
    // Sorteo proporcional: pesa la posición más escasa de cada opción.
    const wSep = separatesFeasible ? Math.min(...coreCounts) : 0;
    const wFull = fullCandidates.reduce((s, p) => s + count(p), 0);
    if (wSep > 0 && wFull > 0) order = rng() * (wSep + wFull) < wFull ? ['full', 'separates'] : ['separates', 'full'];
    else if (wFull > 0) order = ['full', 'separates'];
    else order = ['separates', 'full'];
  }
  if (fulls.length === 0) order = order.filter((s) => s !== 'full');
  if (core.length === 0) order = order.filter((s) => s !== 'separates');
  if (order.length === 0) order = ['none'];

  const failures: { structure: Structure; failure: GenerationFailure }[] = [];
  for (const structure of order) {
    const slots = buildSlots(prep, structure, pinsByPosition);
    if ('ok' in slots) {
      failures.push({ structure, failure: slots });
      continue;
    }
    const found = search(prep, slots.slots, pins, new Set(), previous);
    if (found) {
      const items = sortItems(prep, found);
      const outerMissing = prep.ctx.filters.weather === 'cold' && positionsWithRole(prep, 'outer').length > 0 && !found.some((g) => prep.positionOfGarment.get(g.id)?.role === 'outer');
      if (outerMissing) notes.push('Hace frío, pero no encontré una capa exterior disponible que combine.');
      return { ok: true, items, notes, advice: colorAdvice(found.map((g) => g.color)) };
    }
    failures.push({ structure, failure: diagnose(prep, slots.slots.filter((s) => s.required).map((s) => s.position), pins) });
  }

  // ── Nada funcionó: explicar ──
  const primary = failures.find((f) => f.structure === 'separates') ?? failures[0];
  const result: GenerationFailure = { ...primary.failure, details: [...primary.failure.details], hints: [...primary.failure.hints] };
  if (primary.structure === 'separates' && fulls.length > 0 && pinnedCore.length === 0) {
    const fullFailure = failures.find((f) => f.structure === 'full');
    if (fullCandidates.length === 0) result.details.push('Tampoco hay piezas completas (vestido, overol…) disponibles.');
    else if (fullFailure) result.details.push(`Con pieza completa tampoco: ${fullFailure.failure.message}`);
  }
  result.hints = [...new Set(result.hints)];
  if (notes.length) result.details.push(...notes);
  return result;
}

/** Arma la lista de huecos para una estructura, o un fallo si falta algo obligatorio. */
function buildSlots(
  prep: Prepared,
  structure: Structure,
  pinsByPosition: Map<UUID, Garment[]>,
): { slots: Slot[] } | GenerationFailure {
  const { rng } = prep;
  const weather = prep.ctx.filters.weather;
  const slots: Slot[] = [];
  const has = (p: Position) => (pinsByPosition.get(p.id)?.length ?? 0) > 0 || prep.eligible.get(p.id)!.length > 0;

  const required: Position[] = [];
  const optionalMids: Position[] = [];
  const mids = positionsWithRole(prep, 'mid');
  const pinnedMids = mids.filter((p) => pinsByPosition.has(p.id));
  const availMids = mids.filter(has);
  // ¿Entra la capa intermedia? Fijada → sí; si no, según el clima.
  const wantMid = (): boolean => pinnedMids.length > 0 || (availMids.length > 0 && rng() < optionalChance('mid', weather));
  const midChoice = (): Position | undefined => pinnedMids[0] ?? weightedPick(availMids, (p) => prep.eligible.get(p.id)!.length, rng) ?? undefined;

  if (structure === 'separates') {
    const tops = positionsWithRole(prep, 'top');
    const pinnedTop = tops.some((p) => pinsByPosition.has(p.id));
    const topAvail = tops.some(has);
    // Sin prendas ligeras disponibles, la capa intermedia tiene que ir sí o sí.
    const includeMid = mids.length > 0 && (wantMid() || (!topAvail && availMids.length + pinnedMids.length > 0));
    const mid = includeMid ? midChoice() : undefined;
    const midAlone = !!mid && !pinnedTop && (!topAvail || rng() < MID_ALONE_CHANCE);
    if (midAlone) required.push(mid!);
    else {
      required.push(...tops);
      if (mid) optionalMids.push(mid);
    }
    required.push(...positionsWithRole(prep, 'bottom'));
  }
  if (structure === 'full') {
    if (wantMid()) {
      const mid = midChoice();
      if (mid) optionalMids.push(mid);
    }
    const fulls = positionsWithRole(prep, 'full_body');
    const pinned = fulls.find((p) => pinsByPosition.has(p.id));
    const withCands = fulls.filter(has);
    const chosen = pinned ?? weightedPick(withCands, (p) => prep.eligible.get(p.id)!.length, rng) ?? fulls[0];
    if (chosen) required.push(chosen);
  }
  required.push(...positionsWithRole(prep, 'footwear'));

  const empty = required.filter((p) => !has(p));
  if (empty.length > 0) return emptyPositionsFailure(prep, empty);

  for (const p of required) slots.push({ position: p, required: true });
  for (const p of optionalMids) slots.push({ position: p, required: false });

  // Opcionales: si hay algo fijado ahí, entran sí o sí.
  for (const p of prep.positions) {
    const pinnedHere = pinsByPosition.get(p.id)?.length ?? 0;
    if (p.role === 'outer' || p.role === 'extra') {
      if (pinnedHere > 0 || rng() < optionalChance(p.role, weather)) slots.push({ position: p, required: false });
    } else if (p.role === 'accessory') {
      const n = Math.max(pinnedHere, Math.min(p.max_items, accessoryCount(p.max_items, rng)));
      for (let i = 0; i < n; i++) slots.push({ position: p, required: false });
    }
  }
  return { slots };
}

/**
 * Búsqueda con retroceso. Devuelve las prendas elegidas o null.
 * `pins` ya ocupan su hueco; `avoid` son prendas prohibidas en esta búsqueda.
 */
function search(prep: Prepared, slots: Slot[], pins: Garment[], avoid: Set<UUID>, previous: Set<UUID>): Garment[] | null {
  // Quitar los huecos que ya cubren las fijadas.
  const pinsLeft = new Map<UUID, number>();
  for (const g of pins) {
    const pos = prep.positionOfGarment.get(g.id)!;
    pinsLeft.set(pos.id, (pinsLeft.get(pos.id) ?? 0) + 1);
  }
  const open: Slot[] = [];
  for (const s of slots) {
    const n = pinsLeft.get(s.position.id) ?? 0;
    if (n > 0) pinsLeft.set(s.position.id, n - 1);
    else open.push(s);
  }

  // Heurística: primero las obligatorias con menos candidatas compatibles con
  // lo fijado (fallan antes, así se poda más), luego las opcionales.
  const compatibleWith = (g: Garment, chosen: Garment[]) => chosen.every((c) => prep.compat.check(c, g).ok);
  const initialCount = (s: Slot) => prep.eligible.get(s.position.id)!.filter((g) => !avoid.has(g.id) && compatibleWith(g, pins)).length;
  const required = open.filter((s) => s.required).sort((a, b) => initialCount(a) - initialCount(b));
  const optional = open.filter((s) => !s.required);
  const ordered = [...required, ...optional];

  const chosen: Garment[] = [...pins];
  const chosenIds = new Set(chosen.map((g) => g.id));
  let steps = 0;

  const candidatesFor = (slot: Slot): Garment[] =>
    prep.eligible.get(slot.position.id)!.filter((g) => {
      if (chosenIds.has(g.id) || avoid.has(g.id)) return false;
      // En posiciones de varias prendas (accesorios): nunca dos del mismo tipo.
      if (slot.position.max_items > 1 && chosen.some((c) => c.type_id === g.type_id && prep.positionOfGarment.get(c.id)?.id === slot.position.id)) return false;
      return compatibleWith(g, chosen);
    });

  const dfs = (i: number): boolean => {
    if (i === ordered.length) return true;
    if (++steps > MAX_SEARCH_STEPS) return false;
    const slot = ordered[i];
    const candidates = weightedShuffle(candidatesFor(slot), (g) => weightOf(prep, g, chosen, previous), prep.rng);
    for (const g of candidates) {
      chosen.push(g);
      chosenIds.add(g.id);
      if (dfs(i + 1)) return true;
      chosen.pop();
      chosenIds.delete(g.id);
      if (steps > MAX_SEARCH_STEPS) return false;
    }
    // Una opcional sin candidata compatible simplemente se omite.
    return slot.required ? false : dfs(i + 1);
  };

  return dfs(0) ? chosen : null;
}

function sortItems(prep: Prepared, garments: Garment[]): OutfitItem[] {
  return garments
    .map((g) => ({ positionId: prep.positionOfGarment.get(g.id)!.id, garmentId: g.id }))
    .sort((a, b) => prep.positionById.get(a.positionId)!.sort_order - prep.positionById.get(b.positionId)!.sort_order);
}

// ─── API: cambiar (o agregar) una sola prenda ──────────────────────────────

export type PickResult = { ok: true; garmentId: UUID } | GenerationFailure;

/**
 * Elige una prenda para `positionId` que combine con el resto del outfit.
 * Si `replaceId` viene, esa prenda sale y no puede volver a elegirse.
 */
export function pickForPosition(ctx: GeneratorContext, currentIds: UUID[], positionId: UUID, replaceId?: UUID): PickResult {
  const prep = prepare(ctx);
  const position = prep.positionById.get(positionId);
  if (!position) return { ok: false, message: 'Esa posición ya no existe.', details: [], hints: [] };
  const others = currentIds.filter((id) => id !== replaceId).map((id) => prep.garmentById.get(id)).filter((g): g is Garment => !!g);
  const otherIds = new Set(others.map((g) => g.id));
  const label = position.name.toLowerCase();

  const pool = prep.eligible.get(positionId)!.filter((g) => g.id !== replaceId && !otherIds.has(g.id));
  const sameTypeBlocked = (g: Garment) =>
    position.max_items > 1 && others.some((o) => o.type_id === g.type_id && prep.positionOfGarment.get(o.id)?.id === positionId);
  const typeOk = pool.filter((g) => !sameTypeBlocked(g));

  if (typeOk.length === 0) {
    if (pool.length > 0) {
      return { ok: false, message: `Ya llevas un accesorio de cada tipo disponible en ${label}.`, details: [], hints: ['Quita uno de los accesorios actuales.'] };
    }
    const f = emptyPositionsFailure(prep, [position]);
    return replaceId ? { ...f, message: `No hay otra prenda de ${label} disponible.` } : f;
  }

  const verdicts = new Map<string, number>();
  const compatible = typeOk.filter((g) => {
    for (const o of others) {
      const v = prep.compat.check(o, g);
      if (!v.ok) {
        verdicts.set(v.reason, (verdicts.get(v.reason) ?? 0) + 1);
        return false;
      }
    }
    return true;
  });

  if (compatible.length === 0) {
    return {
      ok: false,
      message: `Ninguna ${replaceId ? 'otra ' : ''}prenda de ${label} combina con el resto del outfit.`,
      details: topReasons(verdicts),
      hints: ['Bloquea menos prendas o cambia otra primero.', 'Puedes crear una excepción desde la ficha de la prenda.'],
    };
  }

  const previous = new Set<UUID>(replaceId ? [replaceId] : []);
  const pick = weightedPick(compatible, (g) => weightOf(prep, g, others, previous), prep.rng)!;
  return { ok: true, garmentId: pick.id };
}

// ─── Diagnóstico ───────────────────────────────────────────────────────────

const REASON_TEXT: Record<ExclusionReason, (n: number, prep: Prepared) => string> = {
  laundry: (n) => `${n} en el cesto`,
  archived: (n) => `${n} ${n === 1 ? 'archivada' : 'archivadas'}`,
  excluded_garment: (n) => `${n} ${n === 1 ? 'deseleccionada' : 'deseleccionadas'} por ti`,
  excluded_type: (n) => `${n} de tipos deseleccionados`,
  excluded_style: (n) => `${n} solo con estilos deseleccionados`,
  target_style: (n, prep) => `${n} no ${n === 1 ? 'es' : 'son'} de estilo ${prep.compat.styleName(prep.ctx.filters.targetStyleId ?? '')}`,
  weather: (n, prep) => `${n} no ${n === 1 ? 'sirve' : 'sirven'} para clima ${WEATHER_LABELS[prep.ctx.filters.weather ?? 'mild'].toLowerCase()}`,
};

const REASON_HINT: Record<ExclusionReason, (prep: Prepared) => string> = {
  laundry: () => 'Marca como lavadas algunas prendas del Cesto.',
  archived: () => 'Desarchiva prendas desde el Guardarropa.',
  excluded_garment: () => 'Vuelve a incluir prendas en "Prendas participantes".',
  excluded_type: () => 'Vuelve a incluir tipos en "Prendas participantes".',
  excluded_style: () => 'Vuelve a incluir estilos en "Prendas participantes".',
  target_style: (prep) => `Quita el estilo objetivo o agrega el estilo ${prep.compat.styleName(prep.ctx.filters.targetStyleId ?? '')} a más prendas.`,
  weather: () => 'Cambia el clima del generador o ajusta el clima de tus prendas.',
};

function emptyPositionsFailure(prep: Prepared, empty: Position[]): GenerationFailure {
  const f = prep.ctx.filters;
  const details: string[] = [];
  const hints: string[] = [];
  const reasonsSeen = new Set<ExclusionReason>();

  for (const p of empty) {
    const total = prep.total.get(p.id) ?? 0;
    if (total === 0) {
      details.push(`${p.name}: no tienes prendas de este tipo.`);
      hints.push(`Agrega prendas de ${p.name.toLowerCase()} en el Guardarropa.`);
      continue;
    }
    const counts = prep.excluded.get(p.id) ?? {};
    const parts = (Object.keys(counts) as ExclusionReason[])
      .filter((r) => (counts[r] ?? 0) > 0)
      .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
      .map((r) => {
        reasonsSeen.add(r);
        return REASON_TEXT[r](counts[r] ?? 0, prep);
      });
    details.push(`${p.name}: ${parts.join(', ')}.`);
  }
  for (const r of reasonsSeen) hints.push(REASON_HINT[r](prep));

  const first = empty[0];
  let suffix = '';
  const counts = prep.excluded.get(first.id) ?? {};
  if (f.targetStyleId && counts.target_style) suffix += ` con estilo ${prep.compat.styleName(f.targetStyleId)}`;
  if (f.weather && counts.weather) suffix += ` para clima ${WEATHER_LABELS[f.weather].toLowerCase()}`;
  const onlyLaundry = Object.keys(counts).length > 0 && Object.keys(counts).every((k) => k === 'laundry');
  const noun = empty.map((p) => p.name.toLowerCase()).join(' ni ');
  let message: string;
  if ((prep.total.get(first.id) ?? 0) === 0 && empty.length === 1) message = `No tienes prendas de ${noun}.`;
  else if (onlyLaundry && empty.length === 1) message = `Todas tus prendas de ${noun} están en el cesto.`;
  else message = `No hay ${noun} disponible${suffix}.`;
  return { ok: false, message, details, hints };
}

function topReasons(verdicts: Map<string, number>, max = 3): string[] {
  return [...verdicts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([reason, n]) => (n > 1 ? `${reason} (${n} casos)` : reason));
}

/**
 * Hay candidatas en todas las posiciones obligatorias, pero ninguna
 * combinación funcionó. Buscamos la causa más concreta posible.
 */
function diagnose(prep: Prepared, required: Position[], pins: Garment[]): GenerationFailure {
  const pinnedPositions = new Set(pins.map((g) => prep.positionOfGarment.get(g.id)!.id));
  const open = required.filter((p) => !pinnedPositions.has(p.id));
  const hints = ['Puedes cambiar las reglas en Ajustes → Reglas, o crear una excepción desde la ficha de una prenda.'];

  // 1) Una posición no tiene nada que combine con lo fijado.
  const afterPins = new Map<UUID, Garment[]>();
  for (const p of open) {
    const verdicts = new Map<string, number>();
    const ok = prep.eligible.get(p.id)!.filter((g) => {
      for (const pin of pins) {
        const v: PairVerdict = prep.compat.check(pin, g);
        if (!v.ok) {
          verdicts.set(v.reason, (verdicts.get(v.reason) ?? 0) + 1);
          return false;
        }
      }
      return true;
    });
    if (ok.length === 0) {
      const names = pins.map((g) => `“${g.name}”`).join(' y ');
      return {
        ok: false,
        message: `Ninguna prenda de ${p.name.toLowerCase()} combina con ${names} (${pins.length === 1 ? 'fijada' : 'fijadas'}).`,
        details: topReasons(verdicts),
        hints: ['Desfija la prenda o crea una excepción desde su ficha.', ...hints],
      };
    }
    afterPins.set(p.id, ok);
  }

  // 2) Dos posiciones sin ningún par compatible entre sí.
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const A = afterPins.get(open[i].id)!;
      const B = afterPins.get(open[j].id)!;
      const verdicts = new Map<string, number>();
      let anyPair = false;
      outer: for (const a of A) {
        for (const b of B) {
          const v = prep.compat.check(a, b);
          if (v.ok) {
            anyPair = true;
            break outer;
          }
          verdicts.set(v.reason, (verdicts.get(v.reason) ?? 0) + 1);
        }
      }
      if (!anyPair) {
        return {
          ok: false,
          message: `Ninguna prenda de ${open[i].name.toLowerCase()} combina con ninguna de ${open[j].name.toLowerCase()}.`,
          details: topReasons(verdicts),
          hints,
        };
      }
    }
  }

  // 3) Caso general: las reglas más frecuentes entre todas las candidatas.
  const verdicts = new Map<string, number>();
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      for (const a of afterPins.get(open[i].id)!) {
        for (const b of afterPins.get(open[j].id)!) {
          const v = prep.compat.check(a, b);
          if (!v.ok) verdicts.set(v.reason, (verdicts.get(v.reason) ?? 0) + 1);
        }
      }
    }
  }
  const structure: Structure = required.some((p) => p.role === 'full_body') ? 'full' : 'separates';
  return {
    ok: false,
    message: `No encontré una combinación de ${STRUCTURE_LABEL[structure]} en la que todas las prendas combinen entre sí.`,
    details: topReasons(verdicts),
    hints,
  };
}

// ─── Utilidades para la interfaz ───────────────────────────────────────────

/** Cuántas prendas participan con los filtros actuales. */
export function countParticipants(ctx: GeneratorContext): { eligible: number; available: number } {
  const prep = prepare(ctx);
  let eligible = 0;
  for (const list of prep.eligible.values()) eligible += list.length;
  const available = ctx.garments.filter((g) => !g.deleted_at && g.status === 'available').length;
  return { eligible, available };
}

/** Rol de la posición de una prenda (útil para ordenar y mostrar). */
export function positionForGarment(catalog: Catalog, g: Garment): Position | undefined {
  const t = catalog.types.find((x) => x.id === g.type_id);
  return t ? catalog.positions.find((p) => p.id === t.position_id) : undefined;
}
