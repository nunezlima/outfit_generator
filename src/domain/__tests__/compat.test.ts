import { describe, expect, it } from 'vitest';
import { CompatIndex, orderedPair } from '../compat';
import { garment, garmentRule, makeCatalog } from './fixtures';

describe('compatibilidad en 3 niveles', () => {
  const catalog = makeCatalog();
  const camisaFormal = garment('Camisa formal', 'Camisa', ['Formal']);
  const camisaVersatil = garment('Camisa versátil', 'Camisa', ['Formal', 'Smart casual']);
  const jeans = garment('Jeans', 'Jeans', ['Casual']);
  const pantalonCasual = garment('Pantalón casual', 'Pantalón de vestir', ['Casual']);
  const chanclas = garment('Chanclas', 'Chanclas', ['Casual']);
  const hoodie = garment('Hoodie', 'Hoodie', ['Formal']);
  const pantalonFormal = garment('Pantalón formal', 'Pantalón de vestir', ['Formal']);

  it('nivel 1: estilos incompatibles bloquean y explican por qué', () => {
    const v = new CompatIndex(catalog).check(camisaFormal, jeans);
    expect(v.ok).toBe(false);
    expect(v.level).toBe('style');
    expect(v.reason).toContain('Formal');
    expect(v.reason).toContain('Casual');
  });

  it('nivel 1: basta con que UN par de estilos combine', () => {
    const v = new CompatIndex(catalog).check(camisaVersatil, jeans);
    expect(v.ok).toBe(true);
    expect(v.reason).toContain('Smart casual');
  });

  it('nivel 2: una regla de tipos prohíbe aunque los estilos combinen', () => {
    const v = new CompatIndex(catalog).check(pantalonCasual, chanclas);
    expect(v.ok).toBe(false);
    expect(v.level).toBe('type');
    expect(v.reason).toBe('Regla de tipos: Pantalón de vestir + Chanclas no se combinan.');
  });

  it('nivel 2: una regla de tipos permite aunque los estilos no combinen', () => {
    const cat = makeCatalog();
    const [type_a, type_b] = orderedPair(camisaFormal.type_id, jeans.type_id);
    cat.typeRules.push({ ...cat.typeRules[0], type_a, type_b, allowed: true });
    const v = new CompatIndex(cat).check(camisaFormal, jeans);
    expect(v.ok).toBe(true);
    expect(v.level).toBe('type');
  });

  it('nivel 3: la excepción de prenda gana sobre la regla de tipos', () => {
    const cat = makeCatalog();
    // Hoodie + pantalón de vestir está prohibido por tipo…
    expect(new CompatIndex(cat).check(hoodie, pantalonFormal).ok).toBe(false);
    // …pero "este hoodie sí va con este pantalón".
    cat.garmentRules.push(garmentRule('Hoodie', 'Pantalón formal', true));
    const v = new CompatIndex(cat).check(hoodie, pantalonFormal);
    expect(v.ok).toBe(true);
    expect(v.level).toBe('garment');
  });

  it('nivel 3: la excepción de prenda puede prohibir aunque todo lo demás combine', () => {
    const cat = makeCatalog();
    expect(new CompatIndex(cat).check(camisaVersatil, jeans).ok).toBe(true);
    cat.garmentRules.push(garmentRule('Camisa versátil', 'Jeans', false));
    const v = new CompatIndex(cat).check(camisaVersatil, jeans);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('nunca');
  });

  it('un par de estilos que no está en la matriz se considera compatible', () => {
    const cat = makeCatalog();
    cat.styleCompat = [];
    expect(new CompatIndex(cat).check(camisaFormal, jeans).ok).toBe(true);
  });

  it('una prenda sin estilos es comodín', () => {
    const anillo = garment('Anillo', 'Anillo', []);
    expect(new CompatIndex(catalog).check(anillo, camisaFormal).ok).toBe(true);
  });

  it('los estilos deseleccionados no cuentan al comparar', () => {
    const smart = catalog.styles.find((s) => s.name === 'Smart casual')!;
    const idx = new CompatIndex(catalog, { excludedStyleIds: [smart.id] });
    expect(idx.check(camisaVersatil, jeans).ok).toBe(false);
  });

  it('orderedPair es independiente del orden', () => {
    expect(orderedPair('b', 'a')).toEqual(['a', 'b']);
    expect(orderedPair('a', 'b')).toEqual(['a', 'b']);
  });
});
