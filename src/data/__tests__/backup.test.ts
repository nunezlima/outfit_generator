import { describe, expect, it } from 'vitest';
import { imageTypeOf, isSafePhotoPath, remapIds } from '../backup';

describe('respaldo: fotos que vienen en el archivo', () => {
  it('acepta solo rutas con la forma que genera la app', () => {
    for (const ok of [
      'garments/0f8fad5b-d9cb-469f-a165-70867728950e-1761600000000.webp',
      'garments/0f8fad5b-d9cb-469f-a165-70867728950e-1761600000000_thumb.webp',
      'garments/vieja.jpg',
      'outfits/7c9e6679-7425-40de-944b-e07fc1f90ae7/16fd2706-8baf-433b-82eb-8c7fada847da.webp',
    ]) {
      expect(isSafePhotoPath(ok), ok).toBe(true);
    }
    for (const bad of [
      '',
      '../x.webp',
      'garments/../../otro-usuario/x.webp',
      '/garments/x.webp',
      'garments/sub/x.webp',
      'otra-carpeta/x.webp',
      'garments/x.svg',
      'garments/x.webp.html',
      'garments/x .webp',
      'garments/x%2F..%2Fy.webp',
      'outfits/x.webp',
    ]) {
      expect(isSafePhotoPath(bad), bad).toBe(false);
    }
  });

  it('reconoce WebP y JPEG por su contenido, no por el nombre', () => {
    const bytes = (...parts: (string | number[])[]) =>
      new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
    expect(imageTypeOf(bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp');
    expect(imageTypeOf(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
    expect(imageTypeOf(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBeNull();
    expect(imageTypeOf(bytes('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(imageTypeOf(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBeNull();
    expect(imageTypeOf(new Uint8Array())).toBeNull();
  });
});

describe('respaldo: reasignación de id al restaurar', () => {
  const u = 'user-1';
  const row = (extra: Record<string, unknown>) => ({ user_id: u, created_at: 'x', updated_at: 'x', deleted_at: null, ...extra });
  const tables = {
    positions: [row({ id: 'p1', role: 'top' })],
    garment_types: [row({ id: 't1', position_id: 'p1' }), row({ id: 't2', position_id: 'p1' })],
    styles: [row({ id: 's1' }), row({ id: 's2' })],
    garments: [row({ id: 'g1', type_id: 't1', style_ids: ['s1', 's2'] }), row({ id: 'g2', type_id: 't2', style_ids: [] })],
    style_compat: [row({ style_a: 's1', style_b: 's2', compatible: false })],
    type_rules: [row({ type_a: 't1', type_b: 't2', allowed: false })],
    garment_rules: [row({ garment_a: 'g1', garment_b: 'g2', allowed: true })],
    presets: [row({ id: 'pr1', config: { excludedTypeIds: ['t1'], excludedStyleIds: [], excludedGarmentIds: ['g2'], targetStyleId: 's2', weather: 'hot' } })],
    outfit_events: [row({ id: 'ev1', name: 'Pulcro', sort_order: 10 })],
    perfumes: [row({ id: 'pf1', name: 'Prada L’Homme', notes: null, status: 'available' })],
    occasions: [row({ id: 'oc1', event_id: 'ev1', name: 'Oficina', style_ids: ['s1'], perfumes_hot: [], perfumes_mild: ['pf1'], perfumes_cold: ['pf1'], sort_order: 10 })],
    outfits: [row({ id: 'o1', garment_ids: ['g1', 'g2'] })],
    wear_log: [row({ id: 'w1', garment_ids: ['g1'], outfit_id: 'o1', perfume_id: 'pf1' })],
    garment_events: [row({ id: 'e1', kind: 'shown', garment_ids: ['g2'] })],
    user_settings: [row({ prefs: {} })],
  };

  it('cambia todos los id y conserva las relaciones', () => {
    let n = 0;
    // id nuevos que invierten el orden alfabético, para comprobar que los pares se reordenan (a < b)
    const out = remapIds(tables, () => `z${String(99 - n++).padStart(2, '0')}`);
    const id = (t: keyof typeof out, i = 0) => String(out[t]![i].id);
    const g1 = id('garments', 0);
    const g2 = id('garments', 1);
    expect(g1).not.toBe('g1');
    expect(out.garment_types![0].position_id).toBe(id('positions'));
    expect(out.garments![0].type_id).toBe(id('garment_types', 0));
    expect(out.garments![0].style_ids).toEqual([id('styles', 0), id('styles', 1)]);
    const sc = out.style_compat![0];
    expect(String(sc.style_a) < String(sc.style_b)).toBe(true);
    expect([sc.style_a, sc.style_b].sort()).toEqual([id('styles', 0), id('styles', 1)].sort());
    const gr = out.garment_rules![0];
    expect(String(gr.garment_a) < String(gr.garment_b)).toBe(true);
    expect(out.outfits![0].garment_ids).toEqual([g1, g2]);
    expect(out.wear_log![0].outfit_id).toBe(id('outfits'));
    expect(out.wear_log![0].perfume_id).toBe(id('perfumes'));
    const oc = out.occasions![0];
    expect(oc.id).not.toBe('oc1');
    expect(oc.event_id).toBe(id('outfit_events'));
    expect(oc.style_ids).toEqual([id('styles', 0)]);
    expect(oc.perfumes_mild).toEqual([id('perfumes')]);
    expect(oc.perfumes_cold).toEqual([id('perfumes')]);
    expect(out.garment_events![0].garment_ids).toEqual([g2]);
    const cfg = out.presets![0].config as Record<string, unknown>;
    expect(cfg.excludedTypeIds).toEqual([id('garment_types', 0)]);
    expect(cfg.excludedGarmentIds).toEqual([g2]);
    expect(cfg.targetStyleId).toBe(id('styles', 1));
    expect(cfg.weather).toBe('hot');
  });
});
