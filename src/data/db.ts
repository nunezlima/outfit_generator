// ═══════════════════════════════════════════════════════════════════════════
// Base de datos LOCAL (IndexedDB vía Dexie). Es la fuente de verdad para la
// interfaz: todo se lee de aquí (funciona sin conexión) y se sincroniza con
// Supabase en segundo plano (ver sync.ts).
//
// Una base por usuario ("guardarropa-<user_id>") para no mezclar datos si
// alguien cierra sesión y entra otra persona en el mismo dispositivo.
// ═══════════════════════════════════════════════════════════════════════════

import Dexie, { type Table } from 'dexie';
import type {
  Garment,
  GarmentEvent,
  GarmentRule,
  GarmentType,
  Occasion,
  Outfit,
  OutfitEvent,
  Perfume,
  Position,
  Preset,
  Style,
  StyleCompat,
  TypeRule,
  UserSettings,
  WearLogEntry,
} from '../domain/types';

/** Tablas que se sincronizan, en orden de dependencias (padres primero). */
export const SYNC_TABLES = [
  'positions',
  'garment_types',
  'styles',
  'garments',
  'style_compat',
  'type_rules',
  'garment_rules',
  'presets',
  'outfit_events',
  'occasions',
  'perfumes',
  'outfits',
  'wear_log',
  'garment_events',
  'user_settings',
] as const;

export type TableName = (typeof SYNC_TABLES)[number];

export interface RowByTable {
  positions: Position;
  garment_types: GarmentType;
  styles: Style;
  garments: Garment;
  style_compat: StyleCompat;
  type_rules: TypeRule;
  garment_rules: GarmentRule;
  presets: Preset;
  outfit_events: OutfitEvent;
  occasions: Occasion;
  perfumes: Perfume;
  outfits: Outfit;
  wear_log: WearLogEntry;
  garment_events: GarmentEvent;
  user_settings: UserSettings;
}

/** Columnas de la clave primaria LOCAL de cada tabla (en Supabase se agrega user_id). */
export const LOCAL_KEY: Record<TableName, string[]> = {
  positions: ['id'],
  garment_types: ['id'],
  styles: ['id'],
  garments: ['id'],
  style_compat: ['style_a', 'style_b'],
  type_rules: ['type_a', 'type_b'],
  garment_rules: ['garment_a', 'garment_b'],
  presets: ['id'],
  outfit_events: ['id'],
  occasions: ['id'],
  perfumes: ['id'],
  outfits: ['id'],
  wear_log: ['id'],
  garment_events: ['id'],
  user_settings: ['user_id'],
};

/** Columnas para ON CONFLICT en Supabase. */
export const REMOTE_CONFLICT: Record<TableName, string> = {
  positions: 'id',
  garment_types: 'id',
  styles: 'id',
  garments: 'id',
  style_compat: 'user_id,style_a,style_b',
  type_rules: 'user_id,type_a,type_b',
  garment_rules: 'user_id,garment_a,garment_b',
  presets: 'id',
  outfit_events: 'id',
  occasions: 'id',
  perfumes: 'id',
  outfits: 'id',
  wear_log: 'id',
  garment_events: 'id',
  user_settings: 'user_id',
};

export function localKeyOf(table: TableName, row: Record<string, unknown>): string | string[] {
  const cols = LOCAL_KEY[table];
  return cols.length === 1 ? String(row[cols[0]]) : cols.map((c) => String(row[c]));
}

/** Clave de texto única (tabla + clave) para identificar una fila en la bandeja. */
export function rowKey(table: TableName, row: Record<string, unknown>): string {
  return `${table}:${LOCAL_KEY[table].map((c) => String(row[c])).join('|')}`;
}

// ─── Bandeja de salida (cambios pendientes de enviar) ──────────────────────

export type OutboxOp =
  | { seq?: number; kind: 'upsert'; table: TableName; key: string; row: Record<string, unknown>; createdAt: number }
  | { seq?: number; kind: 'upload'; key: string; path: string; createdAt: number }
  | { seq?: number; kind: 'remove'; key: string; paths: string[]; createdAt: number };

export type FailedOp = OutboxOp & { error: string; failedAt: number };

/** Fotos: pendientes de subir (pending = 1) o descargadas para verlas sin conexión. */
export interface PhotoBlob {
  path: string;
  blob: Blob;
  pending: 0 | 1;
  cachedAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class LocalDB extends Dexie {
  positions!: Table<Position, string>;
  garment_types!: Table<GarmentType, string>;
  styles!: Table<Style, string>;
  garments!: Table<Garment, string>;
  style_compat!: Table<StyleCompat, [string, string]>;
  type_rules!: Table<TypeRule, [string, string]>;
  garment_rules!: Table<GarmentRule, [string, string]>;
  presets!: Table<Preset, string>;
  outfit_events!: Table<OutfitEvent, string>;
  occasions!: Table<Occasion, string>;
  perfumes!: Table<Perfume, string>;
  outfits!: Table<Outfit, string>;
  wear_log!: Table<WearLogEntry, string>;
  garment_events!: Table<GarmentEvent, string>;
  user_settings!: Table<UserSettings, string>;
  outbox!: Table<OutboxOp, number>;
  failed!: Table<FailedOp, number>;
  photos!: Table<PhotoBlob, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      positions: 'id, sort_order',
      garment_types: 'id, position_id',
      styles: 'id',
      garments: 'id, type_id, status',
      style_compat: '[style_a+style_b]',
      type_rules: '[type_a+type_b]',
      garment_rules: '[garment_a+garment_b], garment_a, garment_b',
      presets: 'id',
      outfits: 'id',
      wear_log: 'id, worn_on, outfit_id',
      garment_events: 'id',
      user_settings: 'user_id',
      outbox: '++seq, key, kind',
      failed: '++seq',
      photos: 'path, pending',
      meta: 'key',
    });
    // v2: eventos, ocasiones y perfumes.
    this.version(2).stores({
      outfit_events: 'id',
      occasions: 'id, event_id',
      perfumes: 'id',
    });
  }
}

let current: LocalDB | null = null;
let currentUser: string | null = null;

export function dbNameFor(userId: string): string {
  return `guardarropa-${userId}`;
}

/** Abre (o reutiliza) la base local del usuario. */
export function openLocalDB(userId: string): LocalDB {
  if (current && currentUser === userId) return current;
  current?.close();
  current = new LocalDB(dbNameFor(userId));
  currentUser = userId;
  return current;
}

export function getDB(): LocalDB {
  if (!current) throw new Error('La base local no está abierta');
  return current;
}

export function getUserId(): string {
  if (!currentUser) throw new Error('No hay usuario');
  return currentUser;
}

export async function closeAndDeleteLocalDB(): Promise<void> {
  if (!current) return;
  const db = current;
  current = null;
  currentUser = null;
  db.close();
  await Dexie.delete(db.name);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDB().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDB().meta.put({ key, value });
}
