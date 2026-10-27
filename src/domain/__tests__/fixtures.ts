// Datos de prueba ficticios y constructores cómodos para las pruebas.

import type { Catalog, Garment, GarmentType, Occasion, Perfume, Position, PositionRole, Style, UUID, Warmth } from '../types';

const ids = new Map<string, UUID>();
let counter = 0;

/** UUID estable por nombre (mismo nombre → mismo id dentro de una corrida). */
export function id(name: string): UUID {
  let v = ids.get(name);
  if (!v) {
    counter++;
    v = `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
    ids.set(name, v);
  }
  return v;
}

const base = { user_id: id('user'), created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null };

function position(name: string, role: PositionRole, sort: number, max = 1): Position {
  return { ...base, id: id(`pos:${name}`), name, role, max_items: max, sort_order: sort };
}

function type(name: string, pos: string, warmth: Warmth = 'medium', wash = 1): GarmentType {
  return { ...base, id: id(`type:${name}`), name, position_id: id(`pos:${pos}`), default_wash_uses: wash, default_warmth: warmth, sort_order: 0 };
}

function style(name: string): Style {
  return { ...base, id: id(`style:${name}`), name, sort_order: 0 };
}

export const P = {
  top: 'Parte superior',
  outer: 'Capa exterior',
  bottom: 'Parte inferior',
  full: 'Pieza completa',
  foot: 'Calzado',
  acc: 'Accesorios',
};

export function makeCatalog(): Catalog {
  const pair = (x: string, y: string) => {
    const [s1, s2] = [id(`style:${x}`), id(`style:${y}`)].sort();
    return [s1, s2] as const;
  };
  const tpair = (x: string, y: string) => {
    const [t1, t2] = [id(`type:${x}`), id(`type:${y}`)].sort();
    return [t1, t2] as const;
  };
  const sc = (x: string, y: string, compatible: boolean) => {
    const [style_a, style_b] = pair(x, y);
    return { ...base, style_a, style_b, compatible };
  };
  const tr = (x: string, y: string, allowed: boolean) => {
    const [type_a, type_b] = tpair(x, y);
    return { ...base, type_a, type_b, allowed };
  };
  return {
    positions: [
      position(P.top, 'top', 10),
      position(P.outer, 'outer', 20),
      position(P.bottom, 'bottom', 30),
      position(P.full, 'full_body', 40),
      position(P.foot, 'footwear', 50),
      position(P.acc, 'accessory', 60, 3),
    ],
    types: [
      type('Camiseta', P.top, 'light'),
      type('Camisa', P.top, 'light'),
      type('Hoodie', P.top, 'medium'),
      type('Chamarra', P.outer, 'medium'),
      type('Abrigo', P.outer, 'warm'),
      type('Jeans', P.bottom, 'medium'),
      type('Pantalón de vestir', P.bottom, 'medium'),
      type('Shorts', P.bottom, 'light'),
      type('Vestido', P.full, 'light'),
      type('Tenis', P.foot, 'medium'),
      type('Zapatos de vestir', P.foot, 'medium'),
      type('Chanclas', P.foot, 'light'),
      type('Reloj', P.acc),
      type('Gorra', P.acc),
      type('Anillo', P.acc),
    ],
    styles: [style('Formal'), style('Smart casual'), style('Casual'), style('Playa')],
    styleCompat: [
      sc('Formal', 'Smart casual', true),
      sc('Formal', 'Casual', false),
      sc('Formal', 'Playa', false),
      sc('Smart casual', 'Casual', true),
      sc('Smart casual', 'Playa', false),
      sc('Casual', 'Playa', true),
    ],
    typeRules: [tr('Pantalón de vestir', 'Chanclas', false), tr('Pantalón de vestir', 'Hoodie', false)],
    garmentRules: [],
    events: [],
    occasions: [],
  };
}

/** Ocasión de prueba con estilos (por nombre) y perfumes (por id) por clima. */
export function occasion(name: string, styles: string[], perfumes: Partial<Record<'hot' | 'mild' | 'cold', string[]>> = {}, eventName = 'Evento'): Occasion {
  return {
    ...base,
    id: id(`occ:${name}`),
    event_id: id(`event:${eventName}`),
    name,
    style_ids: styles.map((s) => id(`style:${s}`)),
    perfumes_hot: (perfumes.hot ?? []).map((n) => id(`perfume:${n}`)),
    perfumes_mild: (perfumes.mild ?? []).map((n) => id(`perfume:${n}`)),
    perfumes_cold: (perfumes.cold ?? []).map((n) => id(`perfume:${n}`)),
    sort_order: 0,
  };
}

export function perfume(name: string, extra: Partial<Perfume> = {}): Perfume {
  return { ...base, id: id(`perfume:${name}`), name, notes: null, status: 'available', ...extra };
}

export function garment(name: string, typeName: string, styles: string[], extra: Partial<Garment> = {}): Garment {
  return {
    ...base,
    id: id(`g:${name}`),
    name,
    type_id: id(`type:${typeName}`),
    style_ids: styles.map((s) => id(`style:${s}`)),
    color: null,
    warmth: 'medium',
    climate: 'all',
    wash_after_uses: 1,
    uses_since_wash: 0,
    status: 'available',
    notes: null,
    photo_path: null,
    stats_reset_at: null,
    is_sample: false,
    ...extra,
  };
}

export function garmentRule(a: string, b: string, allowed: boolean) {
  const [garment_a, garment_b] = [id(`g:${a}`), id(`g:${b}`)].sort();
  return { ...base, garment_a, garment_b, allowed };
}

/** Guardarropa pequeño y variado para las pruebas del generador. */
export function makeWardrobe(): Garment[] {
  return [
    garment('Camisa blanca', 'Camisa', ['Formal', 'Smart casual'], { color: 'blanco' }),
    garment('Camiseta negra', 'Camiseta', ['Casual'], { color: 'negro', warmth: 'light' }),
    garment('Camiseta de playa', 'Camiseta', ['Playa', 'Casual'], { climate: 'hot', color: 'turquesa', warmth: 'light' }),
    garment('Hoodie gris', 'Hoodie', ['Casual'], { color: 'gris' }),
    garment('Chamarra de mezclilla', 'Chamarra', ['Casual', 'Smart casual'], { color: 'mezclilla' }),
    garment('Abrigo camel', 'Abrigo', ['Formal', 'Smart casual'], { climate: 'cold', color: 'beige', warmth: 'warm' }),
    garment('Jeans azules', 'Jeans', ['Casual', 'Smart casual'], { color: 'mezclilla' }),
    garment('Pantalón negro', 'Pantalón de vestir', ['Formal', 'Smart casual'], { color: 'negro' }),
    garment('Shorts caqui', 'Shorts', ['Casual', 'Playa'], { climate: 'hot', color: 'caqui', warmth: 'light' }),
    garment('Vestido floral', 'Vestido', ['Casual', 'Playa'], { climate: 'hot', color: 'multicolor', warmth: 'light' }),
    garment('Tenis blancos', 'Tenis', ['Casual', 'Smart casual'], { color: 'blanco', wash_after_uses: 0 }),
    garment('Zapatos negros', 'Zapatos de vestir', ['Formal'], { color: 'negro', wash_after_uses: 0 }),
    garment('Chanclas', 'Chanclas', ['Playa'], { climate: 'hot', warmth: 'light', wash_after_uses: 0 }),
    garment('Reloj plateado', 'Reloj', ['Formal', 'Smart casual', 'Casual'], { wash_after_uses: 0 }),
    garment('Gorra negra', 'Gorra', ['Casual', 'Playa'], { wash_after_uses: 0 }),
    garment('Anillo', 'Anillo', [], { wash_after_uses: 0 }),
  ];
}
