// ═══════════════════════════════════════════════════════════════════════════
// Operaciones de escritura. TODAS pasan por aquí:
//   1. se aplican a IndexedDB (la interfaz se actualiza al instante), y
//   2. se agregan a la bandeja de salida para enviarse a Supabase.
// Borrar = marcar deleted_at (borrado lógico) para que otros dispositivos
// también se enteren.
// ═══════════════════════════════════════════════════════════════════════════

import { orderedPair } from '../domain/compat';
import { todayISO } from '../domain/dates';
import { applyWash, applyWear } from '../domain/laundry';
import { withoutPerfume } from '../domain/perfumes';
import type {
  EventKind,
  Garment,
  GarmentRule,
  GarmentStatus,
  GarmentType,
  GeneratorFilters,
  Occasion,
  Outfit,
  OutfitEvent,
  Perfume,
  Position,
  Preset,
  Style,
  UserPrefs,
  UUID,
} from '../domain/types';
import { getDB, getUserId, localKeyOf, rowKey, type FailedOp, type OutboxOp, type RowByTable, type TableName } from './db';
import { removePhoto, storeNewPhoto } from './photos';
import { scheduleSync } from './sync';

export const newId = (): UUID => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

type AnyRow = Record<string, unknown>;

/** Guarda filas completas (crear o actualizar) y las encola para enviarse. */
export async function saveRows<T extends TableName>(table: T, rows: RowByTable[T][]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDB();
  const t = db.table(table);
  const stamp = nowISO();
  const prepared: AnyRow[] = rows.map((r) => ({ ...(r as unknown as AnyRow), updated_at: stamp }));
  // Prendas creadas antes de que existiera el campo "clima": todo el año.
  if (table === 'garments') for (const r of prepared) r.climate ??= 'all';
  await db.transaction('rw', t, db.outbox, async () => {
    const alive = prepared.filter((r) => !r.deleted_at);
    const dead = prepared.filter((r) => r.deleted_at).map((r) => localKeyOf(table, r));
    if (alive.length) await t.bulkPut(alive);
    if (dead.length) await t.bulkDelete(dead);
    await db.outbox.bulkAdd(prepared.map((row) => ({ kind: 'upsert' as const, table, key: rowKey(table, row), row, createdAt: Date.now() })));
  });
  scheduleSync();
}

/** Borrado lógico. */
export async function softDelete<T extends TableName>(table: T, rows: RowByTable[T][]): Promise<void> {
  const stamp = nowISO();
  await saveRows(table, rows.map((r) => ({ ...r, deleted_at: stamp })));
}

function baseRow() {
  const stamp = nowISO();
  return { user_id: getUserId(), created_at: stamp, updated_at: stamp, deleted_at: null };
}

// ─── Prendas ───────────────────────────────────────────────────────────────

export type GarmentDraft = Pick<Garment, 'name' | 'type_id' | 'style_ids' | 'color' | 'warmth' | 'climate' | 'wash_after_uses' | 'status' | 'notes'>;

export async function createGarment(draft: GarmentDraft, photo?: Blob | null): Promise<Garment> {
  const id = newId();
  const photo_path = photo ? await storeNewPhoto('garments', `${id}-${Date.now()}`, photo) : null;
  const g: Garment = {
    ...baseRow(),
    id,
    ...draft,
    name: draft.name.trim(),
    notes: draft.notes?.trim() || null,
    uses_since_wash: 0,
    photo_path,
    stats_reset_at: null,
    is_sample: false,
  };
  await saveRows('garments', [g]);
  return g;
}

export async function updateGarment(g: Garment, patch: Partial<Garment>): Promise<Garment> {
  const next: Garment = { ...g, ...patch };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() || null;
  await saveRows('garments', [next]);
  return next;
}

/** Cambia (o quita, con null) la foto de una prenda. */
export async function setGarmentPhoto(g: Garment, file: Blob | null): Promise<Garment> {
  const old = g.photo_path;
  const photo_path = file ? await storeNewPhoto('garments', `${g.id}-${Date.now()}`, file) : null;
  const next = await updateGarment(g, { photo_path });
  if (old && old !== photo_path) await removePhoto(old);
  return next;
}

export async function setStatus(garments: Garment[], status: GarmentStatus): Promise<void> {
  await saveRows('garments', garments.map((g) => ({ ...g, status })));
}

/** "Lavado / listo para usar". */
export async function washGarments(garments: Garment[]): Promise<void> {
  await saveRows('garments', garments.map(applyWash));
}

export async function resetGarmentStats(garments: Garment[]): Promise<void> {
  const stamp = nowISO();
  await saveRows('garments', garments.map((g) => ({ ...g, stats_reset_at: stamp })));
}

/**
 * Elimina una prenda: la quita de los outfits guardados, borra sus
 * excepciones y su foto. El historial de uso se conserva (sin nombre).
 */
export async function deleteGarments(garments: Garment[]): Promise<void> {
  const db = getDB();
  const ids = new Set(garments.map((g) => g.id));
  const outfits = (await db.outfits.toArray()).filter((o) => o.garment_ids.some((id) => ids.has(id)));
  await saveRows('outfits', outfits.map((o) => ({ ...o, garment_ids: o.garment_ids.filter((id) => !ids.has(id)) })));
  const rules = await db.garment_rules.filter((r) => ids.has(r.garment_a) || ids.has(r.garment_b)).toArray();
  await softDelete('garment_rules', rules);
  await softDelete('garments', garments);
  for (const g of garments) await removePhoto(g.photo_path);
}

// ─── Uso y cesto ───────────────────────────────────────────────────────────

/**
 * "Lo usé": registra el día en el historial, suma un uso a cada prenda y
 * manda al cesto las que llegan a su límite. Devuelve las que pasaron al cesto.
 */
export async function markWorn(garmentIds: UUID[], wornOn: string = todayISO(), outfitId: UUID | null = null, perfumeId: UUID | null = null): Promise<Garment[]> {
  const db = getDB();
  const garments = (await db.garments.bulkGet(garmentIds)).filter((g): g is Garment => !!g);
  const outcomes = garments.map(applyWear);
  // El perfume solo se guarda si sigue existiendo (si no, la base lo rechazaría).
  const perfume = perfumeId ? await db.perfumes.get(perfumeId) : undefined;
  await saveRows('wear_log', [
    { ...baseRow(), id: newId(), worn_on: wornOn, garment_ids: garments.map((g) => g.id), outfit_id: outfitId, perfume_id: perfume ? perfume.id : null },
  ]);
  await saveRows('garments', outcomes.map((o) => o.garment));
  return outcomes.filter((o) => o.movedToLaundry).map((o) => o.garment);
}

export async function deleteWearEntry(id: UUID): Promise<void> {
  const e = await getDB().wear_log.get(id);
  if (e) await softDelete('wear_log', [e]);
}

// ─── Eventos del generador (detector de prendas evitadas) ──────────────────

export async function logEvent(kind: EventKind, garmentIds: UUID[]): Promise<void> {
  const ids = [...new Set(garmentIds)].slice(0, 30);
  if (ids.length === 0) return;
  await saveRows('garment_events', [{ ...baseRow(), id: newId(), kind, garment_ids: ids }]);
}

// ─── Outfits guardados ─────────────────────────────────────────────────────

export async function createOutfit(name: string, garmentIds: UUID[], tags: string[] = []): Promise<Outfit> {
  const o: Outfit = { ...baseRow(), id: newId(), name: name.trim() || 'Outfit', tags, garment_ids: garmentIds, favorite: false, photo_paths: [], notes: null };
  await saveRows('outfits', [o]);
  return o;
}

export async function updateOutfit(o: Outfit, patch: Partial<Outfit>): Promise<Outfit> {
  const next = { ...o, ...patch };
  await saveRows('outfits', [next]);
  return next;
}

export async function addOutfitPhoto(o: Outfit, file: Blob): Promise<Outfit> {
  const path = await storeNewPhoto(`outfits/${o.id}`, newId(), file);
  return updateOutfit(o, { photo_paths: [...o.photo_paths, path] });
}

export async function removeOutfitPhoto(o: Outfit, path: string): Promise<Outfit> {
  const next = await updateOutfit(o, { photo_paths: o.photo_paths.filter((p) => p !== path) });
  await removePhoto(path);
  return next;
}

export async function deleteOutfit(o: Outfit): Promise<void> {
  await softDelete('outfits', [o]);
  for (const p of o.photo_paths) await removePhoto(p);
}

// ─── Reglas de compatibilidad ──────────────────────────────────────────────

/** Nivel 1: marcar si dos estilos combinan. */
export async function setStyleCompat(a: UUID, b: UUID, compatible: boolean): Promise<void> {
  if (a === b) return;
  const [style_a, style_b] = orderedPair(a, b);
  const existing = await getDB().style_compat.get([style_a, style_b]);
  await saveRows('style_compat', [{ ...(existing ?? baseRow()), deleted_at: null, style_a, style_b, compatible }]);
}

/** Nivel 2: null quita la regla (vuelve a decidir la matriz de estilos). */
export async function setTypeRule(a: UUID, b: UUID, allowed: boolean | null): Promise<void> {
  if (a === b) return;
  const [type_a, type_b] = orderedPair(a, b);
  const existing = await getDB().type_rules.get([type_a, type_b]);
  if (allowed === null) {
    if (existing) await softDelete('type_rules', [existing]);
    return;
  }
  await saveRows('type_rules', [{ ...(existing ?? baseRow()), deleted_at: null, type_a, type_b, allowed }]);
}

/** Nivel 3: excepción entre prendas; null la quita. */
export async function setGarmentRule(a: UUID, b: UUID, allowed: boolean | null): Promise<void> {
  if (a === b) return;
  const [garment_a, garment_b] = orderedPair(a, b);
  const existing = await getDB().garment_rules.get([garment_a, garment_b]);
  if (allowed === null) {
    if (existing) await softDelete('garment_rules', [existing]);
    return;
  }
  await saveRows('garment_rules', [{ ...(existing ?? baseRow()), deleted_at: null, garment_a, garment_b, allowed }]);
}

/**
 * Varias excepciones de una sola vez (un solo envío). allowed: true = siempre
 * combinan, false = nunca, null = quitar la excepción. Devuelve cómo estaba
 * cada par antes, para poder deshacer.
 */
export async function setGarmentRules(pairs: { a: UUID; b: UUID; allowed: boolean | null }[]): Promise<{ a: UUID; b: UUID; allowed: boolean | null }[]> {
  const db = getDB();
  const previous: { a: UUID; b: UUID; allowed: boolean | null }[] = [];
  const upserts: GarmentRule[] = [];
  const removals: GarmentRule[] = [];
  for (const { a, b, allowed } of pairs) {
    if (a === b) continue;
    const [garment_a, garment_b] = orderedPair(a, b);
    const existing = await db.garment_rules.get([garment_a, garment_b]);
    previous.push({ a, b, allowed: existing && !existing.deleted_at ? existing.allowed : null });
    if (allowed === null) {
      if (existing) removals.push(existing);
    } else {
      upserts.push({ ...(existing ?? baseRow()), deleted_at: null, garment_a, garment_b, allowed });
    }
  }
  if (upserts.length) await saveRows('garment_rules', upserts);
  if (removals.length) await softDelete('garment_rules', removals);
  return previous;
}

// ─── Categorías: posiciones, tipos y estilos ───────────────────────────────

type SortedTable = 'positions' | 'garment_types' | 'styles' | 'presets' | 'outfit_events' | 'occasions';

async function nextSortOrder(table: SortedTable): Promise<number> {
  const rows = (await getDB().table(table).toArray()) as { sort_order: number }[];
  return rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;
}

export async function createPosition(p: Pick<Position, 'name' | 'role' | 'max_items'>): Promise<Position> {
  const row: Position = { ...baseRow(), id: newId(), ...p, name: p.name.trim(), sort_order: await nextSortOrder('positions') };
  await saveRows('positions', [row]);
  return row;
}

export async function createType(t: Pick<GarmentType, 'name' | 'position_id' | 'default_wash_uses' | 'default_warmth'>): Promise<GarmentType> {
  const row: GarmentType = { ...baseRow(), id: newId(), ...t, name: t.name.trim(), sort_order: await nextSortOrder('garment_types') };
  await saveRows('garment_types', [row]);
  return row;
}

export async function createStyle(name: string): Promise<Style> {
  const row: Style = { ...baseRow(), id: newId(), name: name.trim(), sort_order: await nextSortOrder('styles') };
  await saveRows('styles', [row]);
  return row;
}

/** Reordenar: reescribe sort_order según el orden recibido. */
export async function reorder<T extends SortedTable>(table: T, rows: RowByTable[T][]): Promise<void> {
  const changed = rows.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 })).filter((r, i) => r.sort_order !== rows[i].sort_order);
  await saveRows(table, changed as RowByTable[T][]);
}

/** Borra una posición moviendo sus tipos a otra. */
export async function deletePosition(p: Position, moveTypesTo: UUID | null): Promise<void> {
  const db = getDB();
  const types = await db.garment_types.where('position_id').equals(p.id).toArray();
  if (types.length > 0) {
    if (!moveTypesTo) throw new Error('Elige a qué posición mover sus tipos');
    await saveRows('garment_types', types.map((t) => ({ ...t, position_id: moveTypesTo })));
  }
  await softDelete('positions', [p]);
}

/** Borra un tipo moviendo sus prendas a otro tipo. */
export async function deleteType(t: GarmentType, moveGarmentsTo: UUID | null): Promise<void> {
  const db = getDB();
  const garments = await db.garments.where('type_id').equals(t.id).toArray();
  if (garments.length > 0) {
    if (!moveGarmentsTo) throw new Error('Elige a qué tipo mover sus prendas');
    await saveRows('garments', garments.map((g) => ({ ...g, type_id: moveGarmentsTo })));
  }
  const rules = await db.type_rules.filter((r) => r.type_a === t.id || r.type_b === t.id).toArray();
  await softDelete('type_rules', rules);
  await cleanPresets((f) => ({ ...f, excludedTypeIds: (f.excludedTypeIds ?? []).filter((id) => id !== t.id) }));
  await softDelete('garment_types', [t]);
}

/** Borra un estilo; sus prendas pasan a `replaceWith` (o solo lo pierden). */
export async function deleteStyle(s: Style, replaceWith: UUID | null): Promise<void> {
  const db = getDB();
  const garments = (await db.garments.toArray()).filter((g) => g.style_ids.includes(s.id));
  await saveRows(
    'garments',
    garments.map((g) => {
      const rest = g.style_ids.filter((id) => id !== s.id);
      return { ...g, style_ids: replaceWith && !rest.includes(replaceWith) ? [...rest, replaceWith] : rest };
    }),
  );
  const compat = await db.style_compat.filter((r) => r.style_a === s.id || r.style_b === s.id).toArray();
  await softDelete('style_compat', compat);
  // Las ocasiones que lo permitían pasan a permitir el reemplazo (o lo pierden).
  const occasions = (await db.occasions.toArray()).filter((o) => o.style_ids.includes(s.id));
  await saveRows(
    'occasions',
    occasions.map((o) => {
      const rest = o.style_ids.filter((id) => id !== s.id);
      return { ...o, style_ids: replaceWith && !rest.includes(replaceWith) ? [...rest, replaceWith] : rest };
    }),
  );
  await cleanPresets((f) => ({
    ...f,
    excludedStyleIds: (f.excludedStyleIds ?? []).filter((id) => id !== s.id),
    targetStyleId: f.targetStyleId === s.id ? replaceWith : (f.targetStyleId ?? null),
  }));
  await softDelete('styles', [s]);
}

async function cleanPresets(fix: (f: Partial<GeneratorFilters>) => Partial<GeneratorFilters>): Promise<void> {
  const presets = await getDB().presets.toArray();
  const changed = presets
    .map((p) => ({ before: p, after: { ...p, config: fix(p.config) } }))
    .filter((x) => JSON.stringify(x.before.config) !== JSON.stringify(x.after.config))
    .map((x) => x.after);
  await saveRows('presets', changed);
}

// ─── Presets ───────────────────────────────────────────────────────────────

export async function savePreset(name: string, config: GeneratorFilters, existing?: Preset): Promise<Preset> {
  const row: Preset = existing
    ? { ...existing, name: name.trim(), config }
    : { ...baseRow(), id: newId(), name: name.trim(), config, sort_order: await nextSortOrder('presets') };
  await saveRows('presets', [row]);
  return row;
}

// ─── Eventos, ocasiones y perfumes ─────────────────────────────────────────

/** Crea un evento con una primera ocasión del mismo nombre (luego se edita). */
export async function createEvent(name: string): Promise<{ event: OutfitEvent; occasion: Occasion }> {
  const event: OutfitEvent = { ...baseRow(), id: newId(), name: name.trim(), sort_order: await nextSortOrder('outfit_events') };
  await saveRows('outfit_events', [event]);
  const occasion = await createOccasion(event.id, name);
  return { event, occasion };
}

export async function renameEvent(e: OutfitEvent, name: string): Promise<void> {
  await saveRows('outfit_events', [{ ...e, name: name.trim() }]);
}

/** Borra un evento y sus ocasiones. */
export async function deleteEvent(e: OutfitEvent): Promise<void> {
  const occasions = await getDB().occasions.where('event_id').equals(e.id).toArray();
  await softDelete('occasions', occasions);
  await softDelete('outfit_events', [e]);
}

export async function createOccasion(eventId: UUID, name: string): Promise<Occasion> {
  const row: Occasion = {
    ...baseRow(),
    id: newId(),
    event_id: eventId,
    name: name.trim(),
    style_ids: [],
    perfumes_hot: [],
    perfumes_mild: [],
    perfumes_cold: [],
    sort_order: await nextSortOrder('occasions'),
  };
  await saveRows('occasions', [row]);
  return row;
}

export async function saveOccasion(o: Occasion): Promise<void> {
  await saveRows('occasions', [{ ...o, name: o.name.trim() }]);
}

export async function deleteOccasion(o: Occasion): Promise<void> {
  await softDelete('occasions', [o]);
}

export type PerfumeDraft = Pick<Perfume, 'name' | 'notes' | 'status'>;

export async function createPerfume(draft: PerfumeDraft): Promise<Perfume> {
  const row: Perfume = { ...baseRow(), id: newId(), name: draft.name.trim(), notes: draft.notes?.trim() || null, status: draft.status };
  await saveRows('perfumes', [row]);
  return row;
}

export async function updatePerfume(p: Perfume, patch: Partial<PerfumeDraft>): Promise<void> {
  const next: Perfume = { ...p, ...patch };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() || null;
  await saveRows('perfumes', [next]);
}

/** Borra un perfume y lo quita de todas las ocasiones. El historial lo conserva sin nombre. */
export async function deletePerfume(p: Perfume): Promise<void> {
  const db = getDB();
  const occasions = (await db.occasions.toArray()).filter((o) => o.perfumes_hot.includes(p.id) || o.perfumes_mild.includes(p.id) || o.perfumes_cold.includes(p.id));
  await saveRows('occasions', occasions.map((o) => withoutPerfume(o, p.id)));
  await softDelete('perfumes', [p]);
}

// ─── Ajustes ───────────────────────────────────────────────────────────────

export async function updatePrefs(patch: Partial<UserPrefs>): Promise<void> {
  const db = getDB();
  const uid = getUserId();
  const existing = await db.user_settings.get(uid);
  await saveRows('user_settings', [{ ...(existing ?? { ...baseRow(), user_id: uid, prefs: {} }), prefs: { ...existing?.prefs, ...patch } }]);
}

// ─── Bandeja de errores ────────────────────────────────────────────────────

export async function retryFailed(): Promise<void> {
  const db = getDB();
  const failed = await db.failed.toArray();
  await db.transaction('rw', db.failed, db.outbox, async () => {
    for (const f of failed) {
      const op = { ...f } as Partial<FailedOp>;
      delete op.error;
      delete op.failedAt;
      delete op.seq;
      await db.outbox.add(op as OutboxOp);
    }
    await db.failed.clear();
  });
  scheduleSync(100);
}

export async function discardFailed(): Promise<void> {
  await getDB().failed.clear();
}
