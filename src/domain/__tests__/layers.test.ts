import { describe, expect, it } from 'vitest';
import { generateOutfit, type GenerationResult, type GeneratorContext } from '../generator';
import { seededRng } from '../random';
import { EMPTY_FILTERS, type Catalog, type Garment, type GeneratorFilters, type Position, type PositionRole } from '../types';
import { garment, id, makeCatalog } from './fixtures';

// Catálogo de pruebas + posición "Capa intermedia" con el tipo Suéter.
function catalogWithMid(): Catalog {
  const c = makeCatalog();
  const top = c.positions.find((p) => p.role === 'top')!;
  const mid: Position = { ...top, id: id('pos:Capa intermedia'), name: 'Capa intermedia', role: 'mid', sort_order: 15 };
  const sweater = { ...c.types[0], id: id('type:Suéter'), name: 'Suéter', position_id: mid.id };
  return { ...c, positions: [...c.positions, mid], types: [...c.types, sweater] };
}

function wardrobe(): Garment[] {
  return [
    garment('Camiseta blanca', 'Camiseta', ['Casual'], { color: 'blanco', warmth: 'light' }),
    garment('Camiseta gris', 'Camiseta', ['Casual'], { color: 'gris', warmth: 'light' }),
    garment('Suéter verde', 'Suéter', ['Casual'], { color: 'verde' }),
    garment('Suéter vino', 'Suéter', ['Casual'], { color: 'vino' }),
    garment('Chamarra', 'Chamarra', ['Casual'], { color: 'mezclilla' }),
    garment('Jeans', 'Jeans', ['Casual'], { color: 'mezclilla' }),
    garment('Tenis', 'Tenis', ['Casual'], { color: 'blanco', wash_after_uses: 0 }),
  ];
}

function ctx(garments: Garment[], filters: Partial<GeneratorFilters>, seed: number): GeneratorContext {
  return { garments, catalog: catalogWithMid(), filters: { ...EMPTY_FILTERS, ...filters }, rng: seededRng(seed), now: new Date('2026-09-28T12:00:00') };
}

function roles(r: GenerationResult, garments: Garment[]): PositionRole[] {
  if (!r.ok) throw new Error(`Se esperaba éxito: ${r.message} ${r.details.join(' | ')}`);
  const cat = catalogWithMid();
  return r.items.map((it) => {
    const g = garments.find((x) => x.id === it.garmentId)!;
    const t = cat.types.find((x) => x.id === g.type_id)!;
    return cat.positions.find((p) => p.id === t.position_id)!.role;
  });
}

describe('capas del torso', () => {
  it('en frío salen las tres variantes: ligera, ligera + intermedia e intermedia sola', () => {
    const gs = wardrobe();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const rs = roles(generateOutfit(ctx(gs, { weather: 'cold' }, seed)), gs);
      const top = rs.filter((x) => x === 'top').length;
      const mid = rs.filter((x) => x === 'mid').length;
      expect(top + mid).toBeGreaterThan(0);
      expect(top).toBeLessThanOrEqual(1);
      expect(mid).toBeLessThanOrEqual(1);
      seen.add(`${top}-${mid}`);
    }
    expect(seen.has('1-1')).toBe(true);
    expect(seen.has('0-1')).toBe(true);
  });

  it('con sol no sale la capa intermedia', () => {
    const gs = wardrobe();
    for (let seed = 1; seed <= 40; seed++) {
      const rs = roles(generateOutfit(ctx(gs, { weather: 'sun' }, seed)), gs);
      expect(rs).not.toContain('mid');
      expect(rs).toContain('top');
    }
  });

  it('sin prendas ligeras disponibles, la intermedia va sola', () => {
    const gs = wardrobe().map((g) => (g.name.startsWith('Camiseta') ? { ...g, status: 'laundry' as const } : g));
    for (let seed = 1; seed <= 30; seed++) {
      const rs = roles(generateOutfit(ctx(gs, { weather: 'sun' }, seed)), gs);
      expect(rs).toContain('mid');
      expect(rs).not.toContain('top');
    }
  });

  it('una intermedia fijada siempre aparece', () => {
    const gs = wardrobe();
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateOutfit(ctx(gs, { weather: 'sun' }, seed), { pinnedIds: [id('g:Suéter vino')] });
      if (!r.ok) throw new Error(r.message);
      expect(r.items.map((i) => i.garmentId)).toContain(id('g:Suéter vino'));
    }
  });
});
