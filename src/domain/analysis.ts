// ═══════════════════════════════════════════════════════════════════════════
// Estadísticas de uso y detector de prendas evitadas.
//
// Por prenda contamos (a partir de stats_reset_at, si se reinició):
//   · shown          veces que apareció en un outfit generado
//   · strongRejects  veces que la cambiaste con su botón (rechazo fuerte)
//   · weakRejects    veces que regeneraste el outfit completo estando ella
//                    (rechazo débil: no sabemos cuál prenda te disgustó)
//   · timesWorn / lastWornOn  a partir del historial
//
// Tasa de rechazo = (fuertes × 1 + débiles × pesoDébil) ÷ veces mostrada.
// Dividir entre "veces mostrada" evita castigar a una prenda solo porque
// aparece mucho: 3 rechazos en 30 apariciones (0.1) no es lo mismo que 3 en 4
// (0.75). Como cada rechazo corresponde a una aparición, la tasa queda en
// [0, 1]. Solo se usa para sacar conclusiones si shown ≥ minAppearances.
// ═══════════════════════════════════════════════════════════════════════════

import { daysBetween, parseISODate } from './dates';
import type { Garment, GarmentEvent, ISODate, UserPrefs, UUID, WearLogEntry } from './types';

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
}

export function computeUsage(
  garments: Garment[],
  wearLog: WearLogEntry[],
  events: GarmentEvent[],
  prefs: Pick<UserPrefs, 'minAppearances' | 'weakRejectWeight'>,
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
    });
  }

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
  }
  return usage;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface AnalysisRow {
  garment: Garment;
  usage: GarmentUsage;
}

export interface WardrobeAnalysis {
  /** Tasa de rechazo alta con suficientes apariciones. */
  avoided: AnalysisRow[];
  /** Sin usar desde hace ≥ unusedDays (o nunca usadas y agregadas hace ≥ unusedDays). */
  unused: AnalysisRow[];
  /** Nunca usadas (desde el reinicio). */
  neverWorn: AnalysisRow[];
  mostWorn: AnalysisRow[];
  /** Hasta 5 prendas que "quizá ya no te gustan" (resumen periódico). */
  summary: AnalysisRow[];
  /** Prendas con datos insuficientes para opinar sobre rechazo. */
  insufficientData: number;
}

export function analyzeWardrobe(garments: Garment[], usage: Map<UUID, GarmentUsage>, prefs: UserPrefs): WardrobeAnalysis {
  // Las archivadas ya están "fuera de circulación": no se analizan.
  const rows: AnalysisRow[] = garments
    .filter((g) => g.status !== 'archived')
    .map((g) => ({ garment: g, usage: usage.get(g.id)! }))
    .filter((r) => !!r.usage);

  const isAvoided = (r: AnalysisRow) => r.usage.qualified && (r.usage.rejectionRate ?? 0) >= prefs.avoidThreshold;
  const isUnused = (r: AnalysisRow) => r.usage.daysSinceUse >= prefs.unusedDays;

  const avoided = rows.filter(isAvoided).sort((a, b) => (b.usage.rejectionRate ?? 0) - (a.usage.rejectionRate ?? 0) || b.usage.shown - a.usage.shown);
  const unused = rows.filter(isUnused).sort((a, b) => b.usage.daysSinceUse - a.usage.daysSinceUse);
  const neverWorn = rows.filter((r) => r.usage.timesWorn === 0).sort((a, b) => b.usage.daysSinceUse - a.usage.daysSinceUse);
  const mostWorn = rows
    .filter((r) => r.usage.timesWorn > 0)
    .sort((a, b) => b.usage.timesWorn - a.usage.timesWorn || (b.usage.lastWornOn ?? '').localeCompare(a.usage.lastWornOn ?? ''))
    .slice(0, 10);

  // Puntuación del resumen: combina qué tanto la rechazas y cuánto llevas sin
  // usarla. Solo entran las que ya están marcadas por alguno de los dos motivos.
  const score = (r: AnalysisRow) =>
    (isAvoided(r) ? 1 + (r.usage.rejectionRate ?? 0) : 0) + (isUnused(r) ? Math.min(r.usage.daysSinceUse / prefs.unusedDays, 3) * 0.5 : 0);
  const summary = rows
    .filter((r) => isAvoided(r) || isUnused(r))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);

  return {
    avoided,
    unused,
    neverWorn,
    mostWorn,
    summary,
    insufficientData: rows.filter((r) => !r.usage.qualified).length,
  };
}

/** Motivo legible de por qué una prenda está en el resumen. */
export function summaryReason(row: AnalysisRow, prefs: UserPrefs): string {
  const parts: string[] = [];
  if (row.usage.qualified && (row.usage.rejectionRate ?? 0) >= prefs.avoidThreshold) {
    parts.push(`la rechazas el ${Math.round((row.usage.rejectionRate ?? 0) * 100)} % de las veces`);
  }
  if (row.usage.daysSinceUse >= prefs.unusedDays) {
    parts.push(row.usage.lastWornOn ? `no la usas hace ${row.usage.daysSinceUse} días` : `no la has usado desde que la agregaste (${row.usage.daysSinceUse} días)`);
  }
  return parts.join(' y ');
}
