import { describe, expect, it } from 'vitest';
import { analyzeWardrobe, computeUsage, summaryReason } from '../analysis';
import { DEFAULT_PREFS, type Garment, type GarmentEvent, type UserPrefs, type WearLogEntry } from '../types';
import { garment, id, makeCatalog } from './fixtures';

const base = { user_id: id('user'), updated_at: '2026-01-01T00:00:00Z', deleted_at: null };
let n = 0;
const ev = (kind: GarmentEvent['kind'], names: string[], at = '2026-09-01T10:00:00Z'): GarmentEvent => ({
  ...base, id: `ev-${++n}`, kind, garment_ids: names.map((x) => id(`g:${x}`)), created_at: at,
});
const wear = (day: string, names: string[]): WearLogEntry => ({
  ...base, id: `w-${++n}`, worn_on: day, garment_ids: names.map((x) => id(`g:${x}`)), outfit_id: null, created_at: `${day}T08:00:00Z`,
});
const NOW = new Date('2026-09-28T12:00:00');
const OLD = { created_at: '2026-01-01T00:00:00Z' };
/** Día "2026-09-dd" (dentro de un periodo de 60 días que termina el 28). */
const sep = (d: number) => `2026-09-${String(d).padStart(2, '0')}`;

function run(garments: Garment[], log: WearLogEntry[], prefs: Partial<UserPrefs> = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const usage = computeUsage(garments, log, [], p, NOW);
  return { usage, a: analyzeWardrobe({ garments, usage, wearLog: log, catalog: makeCatalog(), prefs: p, now: NOW }) };
}

describe('uso en el periodo', () => {
  it('cuenta solo los usos dentro del periodo y los días que ya tenías la prenda', () => {
    const vieja = garment('Vieja', 'Camisa', [], OLD);
    const nueva = garment('Nueva', 'Camisa', [], { created_at: '2026-09-25T10:00:00' });
    const log = [wear('2026-06-01', ['Vieja']), wear(sep(10), ['Vieja']), wear(sep(26), ['Nueva'])];
    const { usage } = run([vieja, nueva], log, { unusedDays: 30 });
    expect(usage.get(vieja.id)!.timesWorn).toBe(2);
    expect(usage.get(vieja.id)!.recentWears).toBe(1);
    expect(usage.get(vieja.id)!.eligibleDays).toBe(30);
    expect(usage.get(nueva.id)!.eligibleDays).toBe(4); // 25, 26, 27, 28
  });

  it('reiniciar contadores ignora los usos anteriores, pero la rotación recuerda el último', () => {
    const g = garment('Reiniciada', 'Camisa', [], { ...OLD, stats_reset_at: '2026-09-10T00:00:00Z' });
    const u = computeUsage([g], [wear('2026-09-02', ['Reiniciada'])], [ev('shown', ['Reiniciada'])], DEFAULT_PREFS, NOW).get(g.id)!;
    expect(u.timesWorn).toBe(0);
    expect(u.recentWears).toBe(0);
    expect(u.lastWornEver).toBe('2026-09-02');
  });
});

describe('análisis por lo que usas', () => {
  // 3 camisetas y 2 pares de tenis durante 10 días registrados.
  const garments = [
    garment('Favorita', 'Camiseta', [], OLD),
    garment('A veces', 'Camiseta', [], OLD),
    garment('Olvidada', 'Camiseta', [], OLD),
    garment('Tenis 1', 'Tenis', [], OLD),
    garment('Tenis 2', 'Tenis', [], OLD),
    garment('Archivada', 'Camiseta', [], { ...OLD, status: 'archived' }),
  ];
  const log = Array.from({ length: 10 }, (_, i) => wear(sep(10 + i), [i < 9 ? 'Favorita' : 'A veces', i % 2 ? 'Tenis 1' : 'Tenis 2']));

  it('compara cada prenda contra su grupo: no mezcla playeras con calzado', () => {
    const { a } = run(garments, log);
    const fav = a.byId.get(id('g:Favorita'))!;
    expect(fav.expected).toBeCloseTo(10 / 3);
    expect(a.byId.get(id('g:Tenis 1'))!.relative).toBeCloseTo(1);
    expect(a.groups.map((g) => [g.position.name, g.garments, g.used])).toEqual([
      ['Parte superior', 3, 2],
      ['Calzado', 2, 2],
    ]);
  });

  it('separa sin usar, poco usadas y más usadas; ignora archivadas', () => {
    const { a } = run(garments, log);
    expect(a.enoughData).toBe(true);
    expect(a.idle.map((r) => r.garment.name)).toEqual(['Olvidada']);
    expect(a.underused.map((r) => r.garment.name)).toEqual(['A veces']); // 1 uso de ~3.3 esperados
    expect(a.mostWorn[0].garment.name).toBe('Favorita');
    expect([...a.byId.values()].some((r) => r.garment.name === 'Archivada')).toBe(false);
    expect(a.summary.map((r) => r.garment.name)).toEqual(['Olvidada', 'A veces']);
    expect(summaryReason(a.summary[1])).toContain('1 uso');
  });

  it('calcula cuántas prendas suman el 80 % de los usos', () => {
    const { a } = run(garments, log);
    // 20 usos: Favorita 9 + Tenis 5 + Tenis 5 = 19 ≥ 16
    expect(a.concentration).toEqual({ garments: 3, of: 5 });
  });

  it('una prenda recién agregada no se juzga todavía', () => {
    const nueva = garment('Recién comprada', 'Camiseta', [], { created_at: '2026-09-25T10:00:00' });
    const { a } = run([...garments, nueva], log);
    expect(a.idle.map((r) => r.garment.name)).not.toContain('Recién comprada');
  });

  it('con pocos días registrados no hay resumen', () => {
    const { a } = run(garments, log.slice(0, 3));
    expect(a.enoughData).toBe(false);
    expect(a.summary).toHaveLength(0);
    expect(a.loggedDays).toBe(3);
  });
});
