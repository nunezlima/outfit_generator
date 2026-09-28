import { describe, expect, it } from 'vitest';
import { analyzeWardrobe, computeUsage, summaryReason } from '../analysis';
import { DEFAULT_PREFS, type GarmentEvent, type WearLogEntry } from '../types';
import { garment, id } from './fixtures';

const base = { user_id: id('user'), updated_at: '2026-01-01T00:00:00Z', deleted_at: null };
let n = 0;
const ev = (kind: GarmentEvent['kind'], names: string[], at = '2026-09-01T10:00:00Z'): GarmentEvent => ({
  ...base, id: `ev-${++n}`, kind, garment_ids: names.map((x) => id(`g:${x}`)), created_at: at,
});
const wear = (day: string, names: string[]): WearLogEntry => ({
  ...base, id: `w-${++n}`, worn_on: day, garment_ids: names.map((x) => id(`g:${x}`)), outfit_id: null, created_at: `${day}T08:00:00Z`,
});
const repeat = <T,>(k: number, f: () => T) => Array.from({ length: k }, f);
const NOW = new Date('2026-09-28T12:00:00');

describe('tasa de rechazo', () => {
  it('rechazos ponderados ÷ veces mostrada', () => {
    const g = garment('Camisa', 'Camisa', []);
    const events = [
      ...repeat(10, () => ev('shown', ['Camisa'])),
      ...repeat(2, () => ev('reject_strong', ['Camisa'])),
      ...repeat(4, () => ev('reject_weak', ['Camisa'])),
    ];
    const u = computeUsage([g], [], events, DEFAULT_PREFS, NOW).get(g.id)!;
    expect(u.shown).toBe(10);
    expect(u.weightedRejections).toBeCloseTo(2 + 4 * 0.25);
    expect(u.rejectionRate).toBeCloseTo(0.3);
    expect(u.qualified).toBe(true);
  });

  it('no penaliza a la prenda que aparece mucho: 3 de 30 no es 3 de 4', () => {
    const muchas = garment('Muy vista', 'Camisa', []);
    const pocas = garment('Poco vista', 'Camisa', []);
    const events = [
      ...repeat(30, () => ev('shown', ['Muy vista'])),
      ...repeat(3, () => ev('reject_strong', ['Muy vista'])),
      ...repeat(6, () => ev('shown', ['Poco vista'])),
      ...repeat(3, () => ev('reject_strong', ['Poco vista'])),
    ];
    const usage = computeUsage([muchas, pocas], [], events, DEFAULT_PREFS, NOW);
    const a = analyzeWardrobe([muchas, pocas], usage, DEFAULT_PREFS);
    expect(a.avoided.map((r) => r.garment.name)).toEqual(['Poco vista']);
  });

  it('exige un mínimo de apariciones antes de marcar', () => {
    const g = garment('Nueva', 'Camisa', []);
    const events = [...repeat(3, () => ev('shown', ['Nueva'])), ...repeat(3, () => ev('reject_strong', ['Nueva']))];
    const usage = computeUsage([g], [], events, DEFAULT_PREFS, NOW);
    expect(usage.get(g.id)!.rejectionRate).toBe(1);
    expect(usage.get(g.id)!.qualified).toBe(false);
    expect(analyzeWardrobe([g], usage, DEFAULT_PREFS).avoided).toHaveLength(0);
  });

  it('reiniciar contadores ignora los eventos y usos anteriores', () => {
    const g = garment('Reiniciada', 'Camisa', [], { stats_reset_at: '2026-09-10T00:00:00Z' });
    const events = [
      ...repeat(8, () => ev('shown', ['Reiniciada'], '2026-09-01T00:00:00Z')),
      ...repeat(8, () => ev('reject_strong', ['Reiniciada'], '2026-09-01T00:00:00Z')),
      ev('shown', ['Reiniciada'], '2026-09-20T00:00:00Z'),
    ];
    const u = computeUsage([g], [wear('2026-09-02', ['Reiniciada'])], events, DEFAULT_PREFS, NOW).get(g.id)!;
    expect(u.shown).toBe(1);
    expect(u.strongRejects).toBe(0);
    expect(u.timesWorn).toBe(0);
    expect(u.lastWornEver).toBe('2026-09-02'); // la rotación sí recuerda el último uso real
  });
});

describe('análisis del guardarropa', () => {
  it('sin usar desde hace X días, nunca usadas y más usadas', () => {
    const vieja = garment('Vieja', 'Camisa', [], { created_at: '2026-01-01T00:00:00Z' });
    const reciente = garment('Reciente', 'Camisa', [], { created_at: '2026-09-25T00:00:00Z' });
    const favorita = garment('Favorita', 'Jeans', [], { created_at: '2026-01-01T00:00:00Z' });
    const archivada = garment('Archivada', 'Jeans', [], { status: 'archived', created_at: '2026-01-01T00:00:00Z' });
    const log = [wear('2026-09-20', ['Favorita']), wear('2026-09-25', ['Favorita']), wear('2026-05-01', ['Vieja'])];
    const garments = [vieja, reciente, favorita, archivada];
    const usage = computeUsage(garments, log, [], DEFAULT_PREFS, NOW);
    const a = analyzeWardrobe(garments, usage, { ...DEFAULT_PREFS, unusedDays: 60 });
    expect(a.unused.map((r) => r.garment.name)).toEqual(['Vieja']);
    expect(a.neverWorn.map((r) => r.garment.name)).toEqual(['Reciente']);
    expect(a.mostWorn[0].garment.name).toBe('Favorita');
    expect(a.mostWorn[0].usage.timesWorn).toBe(2);
    // Las archivadas no se analizan
    expect([...a.unused, ...a.neverWorn, ...a.mostWorn].some((r) => r.garment.name === 'Archivada')).toBe(false);
    // Una prenda nueva no cuenta como "abandonada"
    expect(usage.get(reciente.id)!.daysSinceUse).toBe(3);
  });

  it('el resumen junta hasta 5 prendas y explica el motivo', () => {
    const garments = Array.from({ length: 7 }, (_, i) => garment(`Prenda ${i}`, 'Camisa', [], { created_at: '2026-01-01T00:00:00Z' }));
    const usage = computeUsage(garments, [], [], DEFAULT_PREFS, NOW);
    const a = analyzeWardrobe(garments, usage, DEFAULT_PREFS);
    expect(a.summary).toHaveLength(5);
    expect(summaryReason(a.summary[0], DEFAULT_PREFS)).toContain('no la has usado');
  });
});
