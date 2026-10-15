// ═══════════════════════════════════════════════════════════════════════════
// Estadísticas de uso y análisis del guardarropa.
//
// El análisis se basa en lo que REALMENTE te pones (botón "Lo usé hoy"), no
// en lo que cambias en el generador: cambiar una prenda puede ser porque no
// combina o porque había otra mejor, así que eso no dice si la evitas.
//
// Por prenda, dentro del periodo de análisis (últimos N días) y desde que se
// agregó o se reiniciaron sus contadores:
//   · recentWears   veces que la usaste en el periodo
//   · eligibleDays  días del periodo en que ya la tenías
//
// Uso esperado: los usos de su grupo (parte superior, calzado, …) repartidos
// entre las prendas del grupo según cuántos días de cada una caen en el
// periodo. Así una prenda recién agregada no sale como "poco usada", y unos
// tenis no se comparan con las playeras (de calzado usas uno al día; de
// accesorios, varios).
//
//   uso relativo = usos en el periodo ÷ uso esperado
//
// (Los eventos "mostrada / rechazo" se siguen contando para la ficha de cada
// prenda, pero ya no deciden nada.)
// ═══════════════════════════════════════════════════════════════════════════

import { daysBetween, parseISODate, toISODate } from './dates';
import type { Catalog, Garment, GarmentEvent, ISODate, Position, UserPrefs, UUID, WearLogEntry } from './types';

export interface GarmentUsage {
  garmentId: UUID;
  shown: number;
  strongRejects: number;
  weakRejects: number;
  weightedRejections: number;
  /** null si nunca se ha mostrado. */
  rejectionRate: number | null;
  /** ¿Hay suficientes apariciones para sacar conclusiones? */
  qualified: boolean;
  timesWorn: number;
  /** Último uso después del reinicio de contadores. */
  lastWornOn: ISODate | null;
  /** Último uso en toda la historia (para la rotación del generador). */
  lastWornEver: ISODate | null;
  /** Días desde el último uso, o desde que se agregó/reinició si nunca se usó. */
  daysSinceUse: number;
  /** Usos dentro del periodo de análisis (desde el reinicio, si lo hubo). */
  recentWears: number;
  /** Días del periodo en que ya tenías la prenda (≥ 1). */
  eligibleDays: number;
}

export function computeUsage(
  garments: Garment[],
  wearLog: WearLogEntry[],
  events: GarmentEvent[],
  prefs: Pick<UserPrefs, 'minAppearances' | 'weakRejectWeight' | 'unusedDays'>,
  now: Date = new Date(),
): Map<UUID, GarmentUsage> {
  const resetAt = new Map<UUID, number>();
  const usage = new Map<UUID, GarmentUsage>();
  for (const g of garments) {
    if (g.stats_reset_at) resetAt.set(g.id, new Date(g.stats_reset_at).getTime());
    usage.set(g.id, {
      garmentId: g.id,
      shown: 0,
      strongRejects: 0,
      weakRejects: 0,
      weightedRejections: 0,
      rejectionRate: null,
      qualified: false,
      timesWorn: 0,
      lastWornOn: null,
      lastWornEver: null,
      daysSinceUse: 0,
      recentWears: 0,
      eligibleDays: 1,
    });
  }
  const period = Math.max(1, prefs.unusedDays);
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (period - 1)).getTime();
  const windowStartISO = toISODate(new Date(windowStart));
  const nowISO = toISODate(now);

  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    for (const id of e.garment_ids) {
      const u = usage.get(id);
      if (!u) continue;
      const reset = resetAt.get(id);
      if (reset !== undefined && t < reset) continue;
      if (e.kind === 'shown') u.shown++;
      else if (e.kind === 'reject_strong') u.strongRejects++;
      else if (e.kind === 'reject_weak') u.weakRejects++;
    }
  }

  for (const w of wearLog) {
    const wornTime = parseISODate(w.worn_on).getTime();
    for (const id of new Set(w.garment_ids)) {
      const u = usage.get(id);
      if (!u) continue;
      if (!u.lastWornEver || w.worn_on > u.lastWornEver) u.lastWornEver = w.worn_on;
      const reset = resetAt.get(id);
      // El reinicio es un instante; comparamos contra el inicio de ese día
      // para que un uso registrado el mismo día después del reinicio cuente.
      if (reset !== undefined && wornTime < startOfDay(reset)) continue;
      u.timesWorn++;
      if (!u.lastWornOn || w.worn_on > u.lastWornOn) u.lastWornOn = w.worn_on;
      if (w.worn_on >= windowStartISO && w.worn_on <= nowISO) u.recentWears++;
    }
  }

  for (const g of garments) {
    const u = usage.get(g.id)!;
    u.weightedRejections = u.strongRejects + u.weakRejects * prefs.weakRejectWeight;
    u.rejectionRate = u.shown > 0 ? Math.min(1, u.weightedRejections / u.shown) : null;
    u.qualified = u.shown >= prefs.minAppearances;
    // Referencia para "días sin usar": el último uso, o si nunca se usó, cuando
    // se agregó / se reiniciaron sus contadores (una prenda recién comprada no
    // debe salir como "abandonada").
    const refs = [u.lastWornOn ? parseISODate(u.lastWornOn) : null, new Date(g.created_at), g.stats_reset_at ? new Date(g.stats_reset_at) : null]
      .filter((d): d is Date => !!d && !isNaN(d.getTime()));
    const ref = refs.reduce((a, b) => (b > a ? b : a));
    u.daysSinceUse = Math.max(0, daysBetween(ref, now));
    // Días del periodo desde que la tienes (o desde el reinicio).
    const since = Math.max(windowStart, startOfDay(Math.max(new Date(g.created_at).getTime() || 0, resetAt.get(g.id) ?? 0)));
    u.eligibleDays = Math.max(1, Math.min(period, Math.round((startOfDay(now.getTime()) - since) / DAY) + 1));
  }
  return usage;
}


const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface AnalysisRow {
  garment: Garment;
  usage: GarmentUsage;
  /** Posición (grupo) con la que se compara. */
  position: Position | undefined;
  /** Usos que tendría en el periodo si rotaras parejo dentro de su grupo. */
  expected: number;
  /** recentWears ÷ expected (null si su grupo no tiene usos en el periodo). */
  relative: number | null;
}

export interface GroupStats {
  position: Position;
  garments: number;
  /** Prendas del grupo usadas al menos una vez en el periodo. */
  used: number;
  wears: number;
}

export interface WardrobeAnalysis {
  periodDays: number;
  /** Días distintos con "Lo usé hoy" dentro del periodo. */
  loggedDays: number;
  /** ¿Hay datos suficientes para sacar conclusiones? */
  enoughData: boolean;
  totalWears: number;
  /** Cuántas prendas suman el 80 % de tus usos (y de cuántas en total). */
  concentration: { garments: number; of: number } | null;
  groups: GroupStats[];
  /** Sin usar en el periodo (ya la tenías al menos MIN_ELIGIBLE días). */
  idle: AnalysisRow[];
  /** Usadas, pero muy por debajo de lo esperado. */
  underused: AnalysisRow[];
  /** Las que más usas en el periodo. */
  mostWorn: AnalysisRow[];
  /** Hasta 5 prendas que quizá no necesitas (resumen mensual). */
  summary: AnalysisRow[];
  /** Por prenda, para la ficha. */
  byId: Map<UUID, AnalysisRow>;
}

/** Días registrados mínimos en el periodo para opinar. */
export const MIN_LOGGED_DAYS = 7;
/** Días que debes tener una prenda antes de juzgar si la usas. */
const MIN_ELIGIBLE_DAYS = 14;
/** Uso relativo por debajo del cual una prenda usada cuenta como "poco usada". */
export const UNDERUSED_RATIO = 0.4;

export function analyzeWardrobe(input: {
  garments: Garment[];
  usage: Map<UUID, GarmentUsage>;
  wearLog: WearLogEntry[];
  catalog: Pick<Catalog, 'positions' | 'types'>;
  prefs: Pick<UserPrefs, 'unusedDays'>;
  now?: Date;
}): WardrobeAnalysis {
  const { garments, usage, wearLog, catalog, prefs } = input;
  const now = input.now ?? new Date();
  const periodDays = Math.max(1, prefs.unusedDays);
  const fromISO = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (periodDays - 1)));
  const nowISO = toISODate(now);
  const loggedDays = new Set(wearLog.filter((w) => !w.deleted_at && w.worn_on >= fromISO && w.worn_on <= nowISO && w.garment_ids.length > 0).map((w) => w.worn_on)).size;
  const enoughData = loggedDays >= MIN_LOGGED_DAYS;

  const positionById = new Map(catalog.positions.map((p) => [p.id, p]));
  const positionOfType = new Map(catalog.types.map((t) => [t.id, positionById.get(t.position_id)]));

  // Las archivadas ya están "fuera de circulación": no se analizan.
  const base = garments
    .filter((g) => !g.deleted_at && g.status !== 'archived' && usage.has(g.id))
    .map((g) => ({ garment: g, usage: usage.get(g.id)!, position: positionOfType.get(g.type_id) }));

  // Uso esperado por grupo, repartido según los días que tienes cada prenda.
  const groupKey = (p: Position | undefined) => p?.id ?? '—';
  const groupWears = new Map<string, number>();
  const groupDays = new Map<string, number>();
  for (const r of base) {
    const k = groupKey(r.position);
    groupWears.set(k, (groupWears.get(k) ?? 0) + r.usage.recentWears);
    groupDays.set(k, (groupDays.get(k) ?? 0) + r.usage.eligibleDays);
  }
  const rows: AnalysisRow[] = base.map((r) => {
    const k = groupKey(r.position);
    const wears = groupWears.get(k) ?? 0;
    const expected = wears > 0 ? (wears * r.usage.eligibleDays) / (groupDays.get(k) || 1) : 0;
    return { ...r, expected, relative: expected > 0 ? r.usage.recentWears / expected : null };
  });

  const groups: GroupStats[] = catalog.positions
    .map((position) => {
      const inGroup = rows.filter((r) => r.position?.id === position.id);
      return {
        position,
        garments: inGroup.length,
        used: inGroup.filter((r) => r.usage.recentWears > 0).length,
        wears: inGroup.reduce((s, r) => s + r.usage.recentWears, 0),
      };
    })
    .filter((g) => g.garments > 0)
    .sort((a, b) => a.position.sort_order - b.position.sort_order);

  const totalWears = rows.reduce((s, r) => s + r.usage.recentWears, 0);
  let concentration: WardrobeAnalysis['concentration'] = null;
  if (totalWears > 0) {
    const sorted = rows.map((r) => r.usage.recentWears).sort((a, b) => b - a);
    let acc = 0;
    let k = 0;
    while (acc < totalWears * 0.8) acc += sorted[k++];
    concentration = { garments: k, of: rows.length };
  }

  const judged = rows.filter((r) => r.usage.eligibleDays >= Math.min(MIN_ELIGIBLE_DAYS, periodDays));
  const idle = judged
    .filter((r) => r.usage.recentWears === 0)
    .sort((a, b) => b.usage.daysSinceUse - a.usage.daysSinceUse || b.expected - a.expected);
  const underused = judged
    .filter((r) => r.usage.recentWears > 0 && r.relative !== null && r.expected >= 1 && r.relative <= UNDERUSED_RATIO)
    .sort((a, b) => (a.relative ?? 0) - (b.relative ?? 0));
  const mostWorn = rows
    .filter((r) => r.usage.recentWears > 0)
    .sort((a, b) => b.usage.recentWears - a.usage.recentWears || (b.relative ?? 0) - (a.relative ?? 0))
    .slice(0, 15);

  // Resumen: primero las que llevan más tiempo sin usarse, luego las poco usadas.
  const summary = enoughData ? [...idle, ...underused].slice(0, 5) : [];

  return {
    periodDays,
    loggedDays,
    enoughData,
    totalWears,
    concentration,
    groups,
    idle,
    underused,
    mostWorn,
    summary,
    byId: new Map(rows.map((r) => [r.garment.id, r])),
  };
}

/** Motivo legible de por qué una prenda está en el resumen o en una lista. */
export function summaryReason(row: AnalysisRow): string {
  const u = row.usage;
  if (u.recentWears === 0) {
    if (!u.lastWornOn) return `no la has usado desde que la agregaste (${u.daysSinceUse} días)`;
    return `no la usas hace ${u.daysSinceUse} días`;
  }
  return `${u.recentWears} ${u.recentWears === 1 ? 'uso' : 'usos'} en el periodo; rotando parejo serían unos ${formatExpected(row.expected)}`;
}

export function formatExpected(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n >= 1 ? n.toFixed(1).replace('.0', '') : n.toFixed(1);
}
