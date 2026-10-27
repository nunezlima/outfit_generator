import { describe, expect, it } from 'vitest';
import { climateForDate, hasAlternative, nextPerfume, perfumeUseCount, rankLabel, suggestPerfume, withoutPerfume, type PerfumeContext } from '../perfumes';
import { seededRng } from '../random';
import { id, occasion, perfume } from './fixtures';

const perfumes = [perfume('Prada L’Homme'), perfume('Amber PH'), perfume('D&G PH'), perfume('Noir Extreme'), perfume('Ombre Leather'), perfume('Viejo', { status: 'archived' })];

const oficina = occasion('Oficina', ['Formal'], { hot: ['D&G PH'], mild: ['Prada L’Homme', 'Amber PH', 'Viejo'], cold: ['Amber PH'] });
const deNegro = occasion('Eventos noche', ['Formal'], { cold: ['Noir Extreme'] });

const ctx = (occ: typeof oficina | null, extra: Partial<PerfumeContext> = {}): PerfumeContext => ({
  occasion: occ,
  occasions: [oficina, deNegro],
  perfumes,
  rng: seededRng(7),
  ...extra,
});

describe('perfume del outfit', () => {
  it('clima sugerido según el mes', () => {
    expect(climateForDate(new Date(2026, 2, 1))).toBe('hot'); // marzo
    expect(climateForDate(new Date(2026, 5, 30))).toBe('hot'); // junio
    expect(climateForDate(new Date(2026, 6, 1))).toBe('mild'); // julio
    expect(climateForDate(new Date(2026, 9, 25))).toBe('mild'); // octubre
    expect(climateForDate(new Date(2026, 10, 1))).toBe('cold'); // noviembre
    expect(climateForDate(new Date(2026, 1, 28))).toBe('cold'); // febrero
  });

  it('con ocasión, primero sugiere el principal del clima pedido', () => {
    const p = suggestPerfume(ctx(oficina), 'mild')!;
    expect(p.perfumeId).toBe(id('perfume:Prada L’Homme'));
    expect(p.rank).toBe(0);
    expect(p.climate).toBe('mild');
    expect(rankLabel(p)).toBe('Principal');
  });

  it('regenerar pasa al secundario y luego vuelve al principal; ignora archivados', () => {
    const c = ctx(oficina);
    const first = suggestPerfume(c, 'mild')!;
    const second = nextPerfume(c, first)!;
    expect(second.perfumeId).toBe(id('perfume:Amber PH'));
    expect(rankLabel(second)).toBe('Secundario');
    const third = nextPerfume(c, second)!;
    expect(third.perfumeId).toBe(id('perfume:Prada L’Homme')); // "Viejo" está archivado
    expect(hasAlternative(c, first)).toBe(true);
  });

  it('sin secundarios no hay otra opción', () => {
    const c = ctx(oficina);
    const p = suggestPerfume(c, 'hot')!;
    expect(p.perfumeId).toBe(id('perfume:D&G PH'));
    expect(hasAlternative(c, p)).toBe(false);
    expect(nextPerfume(c, p)).toBeNull();
  });

  it('si no hay perfume para ese clima, usa el más cercano y lo indica', () => {
    const p = suggestPerfume(ctx(deNegro), 'mild')!;
    expect(p.perfumeId).toBe(id('perfume:Noir Extreme'));
    expect(p.requested).toBe('mild');
    expect(p.climate).toBe('cold');
  });

  it('ocasión sin perfumes: null', () => {
    expect(suggestPerfume(ctx(occasion('Vacía', [])), 'mild')).toBeNull();
  });

  it('sin ocasión: uno al azar entre los de ese clima', () => {
    const allowed = new Set([id('perfume:Prada L’Homme'), id('perfume:Amber PH')]);
    for (let seed = 1; seed <= 30; seed++) {
      const p = suggestPerfume(ctx(null, { rng: seededRng(seed) }), 'mild')!;
      expect(allowed.has(p.perfumeId)).toBe(true);
      expect(rankLabel(p)).toBe('Al azar');
      const n = nextPerfume(ctx(null, { rng: seededRng(seed) }), p)!;
      expect(n.perfumeId).not.toBe(p.perfumeId);
    }
  });

  it('sin ocasión y sin perfumes asignados a ese clima: cualquiera disponible', () => {
    const p = suggestPerfume(ctx(null, { occasions: [] }), 'hot')!;
    expect(p.perfumeId).not.toBe(id('perfume:Viejo'));
  });

  it('sin perfumes: null', () => {
    expect(suggestPerfume(ctx(oficina, { perfumes: [] }), 'mild')).toBeNull();
    expect(suggestPerfume(ctx(null, { perfumes: [] }), 'mild')).toBeNull();
  });

  it('borrar un perfume lo quita de todas las listas', () => {
    const o = withoutPerfume(oficina, id('perfume:Amber PH'));
    expect(o.perfumes_mild).toEqual([id('perfume:Prada L’Homme'), id('perfume:Viejo')]);
    expect(o.perfumes_cold).toEqual([]);
    expect(perfumeUseCount([oficina, deNegro], id('perfume:Amber PH'))).toBe(2);
    expect(perfumeUseCount([o, deNegro], id('perfume:Amber PH'))).toBe(0);
  });

  it('etiqueta de secundarios cuando hay varios', () => {
    expect(rankLabel({ rank: 2, count: 4 })).toBe('Secundario 2 de 3');
  });
});
