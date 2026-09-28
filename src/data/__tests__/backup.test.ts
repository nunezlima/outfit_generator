import { describe, expect, it } from 'vitest';
import { remapIds } from '../backup';

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
    outfits: [row({ id: 'o1', garment_ids: ['g1', 'g2'] })],
    wear_log: [row({ id: 'w1', garment_ids: ['g1'], outfit_id: 'o1' })],
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
    expect(out.garment_events![0].garment_ids).toEqual([g2]);
    const cfg = out.presets![0].config as Record<string, unknown>;
    expect(cfg.excludedTypeIds).toEqual([id('garment_types', 0)]);
    expect(cfg.excludedGarmentIds).toEqual([g2]);
    expect(cfg.targetStyleId).toBe(id('styles', 1));
    expect(cfg.weather).toBe('hot');
  });
});
