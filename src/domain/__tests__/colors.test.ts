import { describe, expect, it } from 'vitest';
import { colorAdvice, colorsClash } from '../colors';

describe('sugerencias de color', () => {
  it('los neutros combinan con todo', () => {
    expect(colorsClash('negro', 'rojo')).toBe(false);
    expect(colorAdvice(['negro', 'blanco', 'mezclilla']).tone).toBe('good');
  });
  it('detecta colores que chocan y colores vecinos', () => {
    expect(colorsClash('rojo', 'verde_olivo')).toBe(false); // olivo es neutro
    expect(colorsClash('amarillo', 'morado')).toBe(false); // complementarios
    expect(colorsClash('rojo', 'morado')).toBe(true);
    expect(colorsClash('naranja', 'rosa')).toBe(true);
    expect(colorAdvice(['azul', 'celeste', 'blanco']).tone).toBe('good');
    expect(colorAdvice(['rojo', 'verde', 'amarillo']).tone).toBe('warn');
  });
  it('colores agregados: neutros nuevos y vecinos', () => {
    expect(colorsClash('plateado', 'rosa')).toBe(false);
    expect(colorsClash('cafe_claro', 'lila')).toBe(false);
    expect(colorsClash('turquesa', 'menta')).toBe(false);
    expect(colorsClash('verde', 'verde_bandera')).toBe(false);
    expect(colorsClash('ladrillo', 'rojo')).toBe(false);
  });
  it('sin colores no opina', () => {
    expect(colorAdvice([null, undefined]).tone).toBe('none');
  });
});
