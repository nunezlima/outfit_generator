import { describe, expect, it } from 'vitest';
import { applyWash, applyWear, usesLeft } from '../laundry';
import { outfitAvailability, validateOutfit } from '../outfits';
import { garment, makeCatalog } from './fixtures';

describe('cesto de ropa sucia', () => {
  it('suma un uso y pasa al cesto al llegar al límite', () => {
    const jeans = garment('Jeans', 'Jeans', [], { wash_after_uses: 3, uses_since_wash: 1 });
    const once = applyWear(jeans);
    expect(once.garment.uses_since_wash).toBe(2);
    expect(once.movedToLaundry).toBe(false);
    expect(once.garment.status).toBe('available');
    const twice = applyWear(once.garment);
    expect(twice.movedToLaundry).toBe(true);
    expect(twice.garment.status).toBe('laundry');
  });

  it('una camiseta de 1 uso va directo al cesto', () => {
    expect(applyWear(garment('Camiseta', 'Camiseta', [], { wash_after_uses: 1 })).movedToLaundry).toBe(true);
  });

  it('wash_after_uses = 0 nunca va al cesto', () => {
    let tenis = garment('Tenis', 'Tenis', [], { wash_after_uses: 0 });
    for (let i = 0; i < 50; i++) tenis = applyWear(tenis).garment;
    expect(tenis.status).toBe('available');
    expect(usesLeft(tenis)).toBeNull();
  });

  it('lavar la deja disponible con el contador en cero', () => {
    const sucia = garment('Camisa', 'Camisa', [], { status: 'laundry', uses_since_wash: 2 });
    const limpia = applyWash(sucia);
    expect(limpia.status).toBe('available');
    expect(limpia.uses_since_wash).toBe(0);
  });
});

describe('outfits guardados', () => {
  it('marca el outfit como no disponible e indica qué prenda falta', () => {
    const a = garment('Camisa', 'Camisa', []);
    const b = garment('Jeans', 'Jeans', [], { status: 'laundry' });
    const c = garment('Tenis', 'Tenis', [], { status: 'archived' });
    const map = new Map([a, b, c].map((g) => [g.id, g]));
    const av = outfitAvailability({ garment_ids: [a.id, b.id, c.id, 'borrada'] }, map);
    expect(av.available).toBe(false);
    expect(av.missing.map((m) => `${m.name}:${m.reason}`)).toEqual(['Jeans:laundry', 'Tenis:archived', 'Prenda eliminada:deleted']);
  });

  it('valida estructura y reglas de un outfit armado a mano', () => {
    const catalog = makeCatalog();
    const w = validateOutfit([garment('Pantalón', 'Pantalón de vestir', []), garment('Chanclas', 'Chanclas', [])], catalog);
    expect(w.structure).toContain('Falta la parte superior (o una pieza completa).');
    expect(w.conflicts[0].verdict.reason).toContain('Pantalón de vestir + Chanclas');
  });
});
