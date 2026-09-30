import { describe, expect, it } from 'vitest';
import type { GarmentUsage } from '../analysis';
import { CompatIndex } from '../compat';
import { generateOutfit, pickForPosition, recencyWeight, weatherAllows, type GenerationResult, type GeneratorContext } from '../generator';
import { seededRng } from '../random';
import { EMPTY_FILTERS, type Garment, type GeneratorFilters, type PositionRole } from '../types';
import { P, garment, id, makeCatalog, makeWardrobe } from './fixtures';

function ctx(garments: Garment[], filters: Partial<GeneratorFilters> = {}, seed = 1, extra: Partial<GeneratorContext> = {}): GeneratorContext {
  return { garments, catalog: makeCatalog(), filters: { ...EMPTY_FILTERS, ...filters }, rng: seededRng(seed), now: new Date('2026-09-28T12:00:00'), ...extra };
}

function ok(r: GenerationResult) {
  if (!r.ok) throw new Error(`Se esperaba éxito: ${r.message} ${r.details.join(' | ')}`);
  return r;
}

const roleOf = (g: Garment): PositionRole => {
  const cat = makeCatalog();
  const t = cat.types.find((x) => x.id === g.type_id)!;
  return cat.positions.find((p) => p.id === t.position_id)!.role;
};

describe('generador de outfits', () => {
  const wardrobe = makeWardrobe();
  const byId = new Map(wardrobe.map((g) => [g.id, g]));

  it('siempre respeta las reglas y la estructura (200 semillas)', () => {
    const compat = new CompatIndex(makeCatalog());
    for (let seed = 1; seed <= 200; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, {}, seed)));
      const gs = r.items.map((i) => byId.get(i.garmentId)!);
      const roles = gs.map(roleOf);
      // Todos los pares combinan
      expect(compat.firstConflict(gs)).toBeNull();
      // Superior + inferior, o pieza completa; siempre calzado
      const full = roles.includes('full_body');
      if (full) expect(roles.filter((x) => x === 'top' || x === 'bottom')).toHaveLength(0);
      else {
        expect(roles.filter((x) => x === 'top')).toHaveLength(1);
        expect(roles.filter((x) => x === 'bottom')).toHaveLength(1);
      }
      expect(roles.filter((x) => x === 'footwear')).toHaveLength(1);
      expect(roles.filter((x) => x === 'outer').length).toBeLessThanOrEqual(1);
      // Accesorios: máximo 3 y nunca dos del mismo tipo
      const acc = gs.filter((g) => roleOf(g) === 'accessory');
      expect(acc.length).toBeLessThanOrEqual(3);
      expect(new Set(acc.map((g) => g.type_id)).size).toBe(acc.length);
    }
  });

  it('excluye la ropa en el cesto y la archivada', () => {
    const w = wardrobe.map((g) =>
      g.name === 'Jeans azules' ? { ...g, status: 'laundry' as const } : g.name === 'Tenis blancos' ? { ...g, status: 'archived' as const } : g,
    );
    for (let seed = 1; seed <= 50; seed++) {
      const r = ok(generateOutfit(ctx(w, {}, seed)));
      expect(r.items.map((i) => i.garmentId)).not.toContain(id('g:Jeans azules'));
      expect(r.items.map((i) => i.garmentId)).not.toContain(id('g:Tenis blancos'));
    }
  });

  it('usa pieza completa cuando no hay partes inferiores disponibles', () => {
    const w = wardrobe.map((g) => (roleOf(g) === 'bottom' ? { ...g, status: 'laundry' as const } : g));
    const r = ok(generateOutfit(ctx(w, {}, 3)));
    expect(r.items.map((i) => i.garmentId)).toContain(id('g:Vestido floral'));
  });

  it('las prendas fijadas siempre aparecen y el resto combina con ellas', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, {}, seed), { pinnedIds: [id('g:Pantalón negro')] }));
      const ids = r.items.map((i) => i.garmentId);
      expect(ids).toContain(id('g:Pantalón negro'));
      expect(ids).not.toContain(id('g:Chanclas')); // regla de tipos
      expect(ids).not.toContain(id('g:Hoodie gris')); // regla de tipos
    }
  });

  it('respeta el estilo objetivo', () => {
    const formal = id('style:Formal');
    for (let seed = 1; seed <= 30; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, { targetStyleId: formal }, seed)));
      for (const it of r.items) {
        const g = byId.get(it.garmentId)!;
        if (g.style_ids.length > 0) expect(g.style_ids).toContain(formal);
      }
    }
  });

  it('clima calor: nada de frío ni capa exterior', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, { weather: 'hot' }, seed)));
      for (const it of r.items) {
        const g = byId.get(it.garmentId)!;
        expect(g.climate).not.toBe('cold');
        expect(roleOf(g)).not.toBe('outer');
      }
    }
  });

  it('clima templado: solo prendas de todo el año', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, { weather: 'mild' }, seed)));
      for (const it of r.items) expect(byId.get(it.garmentId)!.climate).toBe('all');
    }
  });

  it('clima frío: incluye capa exterior y nada de calor', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, { weather: 'cold' }, seed)));
      const gs = r.items.map((i) => byId.get(i.garmentId)!);
      expect(gs.some((g) => roleOf(g) === 'outer')).toBe(true);
      for (const g of gs) expect(g.climate).not.toBe('hot');
    }
  });

  it('weatherAllows: calor/frío + todo el año; templado solo todo el año', () => {
    expect(weatherAllows('hot', 'hot')).toBe(true);
    expect(weatherAllows('all', 'hot')).toBe(true);
    expect(weatherAllows('cold', 'hot')).toBe(false);
    expect(weatherAllows('all', 'mild')).toBe(true);
    expect(weatherAllows('hot', 'mild')).toBe(false);
    expect(weatherAllows('cold', 'mild')).toBe(false);
    expect(weatherAllows('cold', 'cold')).toBe(true);
    expect(weatherAllows('hot', 'cold')).toBe(false);
    expect(weatherAllows('cold', null)).toBe(true);
    // Filas antiguas sin clima = todo el año
    expect(weatherAllows(undefined, 'mild')).toBe(true);
  });

  it('los estilos deseleccionados quitan prendas que solo tenían esos estilos', () => {
    const playa = id('style:Playa');
    for (let seed = 1; seed <= 30; seed++) {
      const r = ok(generateOutfit(ctx(wardrobe, { excludedStyleIds: [playa] }, seed)));
      expect(r.items.map((i) => i.garmentId)).not.toContain(id('g:Chanclas'));
    }
  });
});

describe('explicaciones cuando no hay combinación', () => {
  const wardrobe = makeWardrobe();

  it('dice que no hay calzado limpio del estilo pedido', () => {
    const w = wardrobe.map((g) => (g.name === 'Zapatos negros' ? { ...g, status: 'laundry' as const, wash_after_uses: 1 } : g));
    const r = generateOutfit(ctx(w, { targetStyleId: id('style:Formal') }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe('No hay calzado disponible con estilo Formal.');
    expect(r.details.join(' ')).toContain('1 en el cesto');
    expect(r.details.join(' ')).toContain('no son de estilo Formal');
    expect(r.hints.join(' ')).toContain('Cesto');
  });

  it('dice cuando todo está en el cesto', () => {
    const w = wardrobe.map((g) => (roleOf(g) === 'footwear' ? { ...g, status: 'laundry' as const } : g));
    const r = generateOutfit(ctx(w));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Todas tus prendas de calzado están en el cesto.');
  });

  it('explica qué regla impide combinar con una prenda fijada', () => {
    const w = wardrobe.filter((g) => roleOf(g) !== 'footwear' || g.name === 'Chanclas');
    const r = generateOutfit(ctx(w), { pinnedIds: [id('g:Pantalón negro')] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe('Ninguna prenda de calzado combina con “Pantalón negro” (fijada).');
    expect(r.details[0]).toContain('Regla de tipos: Pantalón de vestir + Chanclas no se combinan.');
  });

  it('detecta dos posiciones sin ningún par compatible', () => {
    const w = [
      garment('Camisa formal', 'Camisa', ['Formal']),
      garment('Shorts de playa', 'Shorts', ['Playa']),
      garment('Tenis', 'Tenis', []),
    ];
    const r = generateOutfit(ctx(w));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe('Ninguna prenda de parte superior combina con ninguna de parte inferior.');
    expect(r.details[0]).toContain('Estilos: Formal no combina con Playa.');
  });

  it('avisa si no tienes prendas de una posición obligatoria', () => {
    const w = wardrobe.filter((g) => roleOf(g) !== 'footwear');
    const r = generateOutfit(ctx(w));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('No tienes prendas de calzado.');
  });

  it('prendas fijadas incompatibles entre sí', () => {
    const r = generateOutfit(ctx(wardrobe), { pinnedIds: [id('g:Pantalón negro'), id('g:Hoodie gris')] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('no combinan entre sí');
  });
});

describe('cambiar una sola prenda', () => {
  const wardrobe = makeWardrobe();

  it('elige otra prenda compatible para la misma posición', () => {
    const current = [id('g:Camiseta negra'), id('g:Jeans azules'), id('g:Tenis blancos')];
    for (let seed = 1; seed <= 20; seed++) {
      const r = pickForPosition(ctx(wardrobe, {}, seed), current, id(`pos:${P.foot}`), id('g:Tenis blancos'));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.garmentId).not.toBe(id('g:Tenis blancos'));
        // Con camiseta casual + jeans solo combinan las chanclas (Playa–Casual)
        expect(r.garmentId).toBe(id('g:Chanclas'));
      }
    }
  });

  it('explica cuando no hay alternativa', () => {
    const current = [id('g:Camisa blanca'), id('g:Pantalón negro'), id('g:Zapatos negros')];
    const r = pickForPosition(ctx(wardrobe), current, id(`pos:${P.foot}`), id('g:Zapatos negros'));
    // Tenis (smart casual) sí combinan con camisa + pantalón
    expect(r.ok).toBe(true);
    const w2 = wardrobe.filter((g) => g.name !== 'Tenis blancos');
    const r2 = pickForPosition(ctx(w2), current, id(`pos:${P.foot}`), id('g:Zapatos negros'));
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.message).toBe('Ninguna otra prenda de calzado combina con el resto del outfit.');
      expect(r2.details.join(' ')).toContain('no combina con Playa');
    }
  });
});

describe('aleatoriedad ponderada', () => {
  it('recencyWeight favorece lo que no se usa hace tiempo', () => {
    expect(recencyWeight(0)).toBeCloseTo(0.2);
    expect(recencyWeight(7)).toBeLessThan(recencyWeight(30));
    expect(recencyWeight(null)).toBeGreaterThan(recencyWeight(30));
  });

  it('una prenda usada hoy sale mucho menos que una olvidada, pero sí sale', () => {
    const w = [
      garment('Camiseta A', 'Camiseta', []),
      garment('Camiseta B', 'Camiseta', []),
      garment('Jeans', 'Jeans', []),
      garment('Tenis', 'Tenis', [], { wash_after_uses: 0 }),
    ];
    const usage = new Map<string, GarmentUsage>();
    const u = (gid: string, lastWornEver: string | null): GarmentUsage => ({
      garmentId: gid, shown: 0, strongRejects: 0, weakRejects: 0, weightedRejections: 0, rejectionRate: null, qualified: false,
      timesWorn: lastWornEver ? 1 : 0, lastWornOn: lastWornEver, lastWornEver, daysSinceUse: 0,
    });
    usage.set(id('g:Camiseta A'), u(id('g:Camiseta A'), '2026-09-28'));
    usage.set(id('g:Camiseta B'), u(id('g:Camiseta B'), '2026-06-01'));
    let a = 0;
    let b = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const r = ok(generateOutfit(ctx(w, {}, seed, { usage })));
      const ids = r.items.map((i) => i.garmentId);
      if (ids.includes(id('g:Camiseta A'))) a++;
      if (ids.includes(id('g:Camiseta B'))) b++;
    }
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeGreaterThan(3);
  });

  it('al regenerar, el outfit anterior se desfavorece', () => {
    const w = [
      garment('Camiseta A', 'Camiseta', []),
      garment('Camiseta B', 'Camiseta', []),
      garment('Jeans', 'Jeans', []),
      garment('Tenis', 'Tenis', []),
    ];
    let repeats = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = ok(generateOutfit(ctx(w, {}, seed), { previousIds: [id('g:Camiseta A')] }));
      if (r.items.some((i) => i.garmentId === id('g:Camiseta A'))) repeats++;
    }
    expect(repeats / 400).toBeLessThan(0.4);
  });
});
