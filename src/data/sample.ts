// Carga y borra los datos de EJEMPLO (ficticios) para probar la app.

import { orderedPair } from '../domain/compat';
import { toISODate } from '../domain/dates';
import {
  SAMPLE_EVENTS,
  SAMPLE_GARMENT_RULES,
  SAMPLE_GARMENTS,
  SAMPLE_OUTFITS,
  SAMPLE_WEAR,
} from '../domain/sampleData';
import type { Garment, GarmentEvent, GarmentRule, GarmentType, Outfit, Position, PositionRole, Style, WearLogEntry } from '../domain/types';
import { getDB, getUserId } from './db';
import { createPosition, createStyle, createType, deleteGarments, newId, saveRows, softDelete } from './repo';

const DEFAULT_POSITION_NAMES: Record<PositionRole, string> = {
  top: 'Parte superior',
  mid: 'Capa intermedia',
  bottom: 'Parte inferior',
  full_body: 'Pieza completa',
  footwear: 'Calzado',
  outer: 'Capa exterior',
  accessory: 'Accesorios',
  extra: 'Otra',
};

const daysAgo = (n: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export async function loadSampleData(): Promise<number> {
  const db = getDB();
  const uid = getUserId();
  const norm = (s: string) => s.trim().toLocaleLowerCase('es');

  // ── Asegurar posiciones, tipos y estilos (por nombre / rol) ──
  const positions: Position[] = await db.positions.toArray();
  const types: GarmentType[] = await db.garment_types.toArray();
  const styles: Style[] = await db.styles.toArray();

  const positionFor = async (role: PositionRole): Promise<Position> => {
    let p = positions.find((x) => x.role === role);
    if (!p) {
      p = await createPosition({ name: DEFAULT_POSITION_NAMES[role], role, max_items: role === 'accessory' ? 3 : 1 });
      positions.push(p);
    }
    return p;
  };
  const typeFor = async (name: string, role: PositionRole, wash: number, warmth: Garment['warmth']): Promise<GarmentType> => {
    let t = types.find((x) => norm(x.name) === norm(name));
    if (!t) {
      t = await createType({ name, position_id: (await positionFor(role)).id, default_wash_uses: wash, default_warmth: warmth });
      types.push(t);
    }
    return t;
  };
  const styleFor = async (name: string): Promise<Style> => {
    let s = styles.find((x) => norm(x.name) === norm(name));
    if (!s) {
      s = await createStyle(name);
      styles.push(s);
    }
    return s;
  };

  // ── Prendas (con fecha de alta de hace 100 días para que el análisis tenga datos) ──
  const created = daysAgo(100).toISOString();
  const byName = new Map<string, Garment>();
  const garments: Garment[] = [];
  for (const s of SAMPLE_GARMENTS) {
    const type = await typeFor(s.type, s.role, s.wash, s.warmth);
    const styleIds: string[] = [];
    for (const st of s.styles) styleIds.push((await styleFor(st)).id);
    const g: Garment = {
      id: newId(),
      user_id: uid,
      created_at: created,
      updated_at: created,
      deleted_at: null,
      name: s.name,
      type_id: type.id,
      style_ids: styleIds,
      color: s.color,
      warmth: s.warmth,
      climate: s.climate ?? 'all',
      wash_after_uses: s.wash,
      uses_since_wash: s.uses ?? 0,
      status: s.status ?? 'available',
      notes: s.notes ?? null,
      photo_path: null,
      stats_reset_at: null,
      is_sample: true,
    };
    garments.push(g);
    byName.set(s.name, g);
  }
  await saveRows('garments', garments);

  const idsOf = (names: string[]) => names.map((n) => byName.get(n)?.id).filter((x): x is string => !!x);

  // ── Outfits guardados ──
  const outfitByName = new Map<string, Outfit>();
  const outfits: Outfit[] = SAMPLE_OUTFITS.map((o) => {
    const row: Outfit = { id: newId(), user_id: uid, created_at: created, updated_at: created, deleted_at: null, name: o.name, tags: o.tags, favorite: o.favorite, garment_ids: idsOf(o.garments), photo_paths: [], notes: null };
    outfitByName.set(o.name, row);
    return row;
  });
  await saveRows('outfits', outfits);

  // ── Historial ──
  const wear: WearLogEntry[] = SAMPLE_WEAR.map((w) => {
    const outfit = w.outfit ? outfitByName.get(w.outfit) : undefined;
    const at = daysAgo(w.daysAgo);
    return {
      id: newId(),
      user_id: uid,
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
      deleted_at: null,
      worn_on: toISODate(at),
      garment_ids: outfit ? outfit.garment_ids : idsOf(w.garments ?? []),
      outfit_id: outfit?.id ?? null,
    };
  });
  await saveRows('wear_log', wear);

  // ── Eventos del generador (repartidos en los últimos 30 días) ──
  const events: GarmentEvent[] = [];
  const ev = (kind: GarmentEvent['kind'], gid: string, i: number) => {
    const at = daysAgo(1 + ((i * 7) % 30), 8 + (i % 10)).toISOString();
    events.push({ id: newId(), user_id: uid, created_at: at, updated_at: at, deleted_at: null, kind, garment_ids: [gid] });
  };
  for (const e of SAMPLE_EVENTS) {
    const g = byName.get(e.garment);
    if (!g) continue;
    for (let i = 0; i < e.shown; i++) ev('shown', g.id, i);
    for (let i = 0; i < e.strong; i++) ev('reject_strong', g.id, i);
    for (let i = 0; i < e.weak; i++) ev('reject_weak', g.id, i);
  }
  await saveRows('garment_events', events);

  // ── Excepción de ejemplo ──
  const rules: GarmentRule[] = SAMPLE_GARMENT_RULES.flatMap((r) => {
    const a = byName.get(r.a);
    const b = byName.get(r.b);
    if (!a || !b) return [];
    const [garment_a, garment_b] = orderedPair(a.id, b.id);
    return [{ user_id: uid, created_at: created, updated_at: created, deleted_at: null, garment_a, garment_b, allowed: r.allowed }];
  });
  await saveRows('garment_rules', rules);

  return garments.length;
}

/** Borra todas las prendas de ejemplo y lo que dependía solo de ellas. */
export async function removeSampleData(): Promise<number> {
  const db = getDB();
  const samples = await db.garments.filter((g) => g.is_sample).toArray();
  if (samples.length === 0) return 0;
  const ids = new Set(samples.map((g) => g.id));
  const onlySample = (list: string[]) => list.length > 0 && list.every((id) => ids.has(id));

  const outfits = (await db.outfits.toArray()).filter((o) => onlySample(o.garment_ids));
  const wear = (await db.wear_log.toArray()).filter((w) => onlySample(w.garment_ids));
  const events = (await db.garment_events.toArray()).filter((e) => onlySample(e.garment_ids));
  await softDelete('outfits', outfits);
  await softDelete('wear_log', wear);
  await softDelete('garment_events', events);
  await deleteGarments(samples);
  return samples.length;
}
