import { describe, expect, it } from 'vitest';
import { applyBulkChanges, type BulkChanges } from '../bulkEdit';
import { garment, id } from './fixtures';

const none: BulkChanges = { styles: {}, typeId: null, climate: null, warmth: null, status: null };

describe('edición masiva', () => {
  it('agrega y quita estilos sin duplicar ni tocar los demás', () => {
    const g = garment('Jeans', 'Jeans', ['Casual', 'Smart casual']);
    const r = applyBulkChanges(g, { ...none, styles: { [id('style:Formal')]: 'add', [id('style:Casual')]: 'remove', [id('style:Smart casual')]: 'add' } })!;
    expect(r.style_ids).toEqual([id('style:Smart casual'), id('style:Formal')]);
    expect(r.name).toBe('Jeans');
    expect(r.type_id).toBe(g.type_id);
  });

  it('cambia solo los campos elegidos', () => {
    const g = garment('Abrigo', 'Abrigo', ['Formal'], { climate: 'all', warmth: 'warm' });
    const r = applyBulkChanges(g, { ...none, climate: 'cold', status: 'archived' })!;
    expect(r.climate).toBe('cold');
    expect(r.status).toBe('archived');
    expect(r.warmth).toBe('warm');
    expect(r.style_ids).toEqual(g.style_ids);
  });

  it('devuelve null si nada cambia (p. ej. agregar un estilo que ya tiene)', () => {
    const g = garment('Camisa', 'Camisa', ['Formal']);
    expect(applyBulkChanges(g, none)).toBe(null);
    expect(applyBulkChanges(g, { ...none, styles: { [id('style:Formal')]: 'add', [id('style:Playa')]: 'remove' } })).toBe(null);
    expect(applyBulkChanges(g, { ...none, climate: 'all' })).toBe(null);
  });
});
