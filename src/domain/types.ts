// Tipos del dominio. Los nombres de campos coinciden con las columnas de la
// base de datos (snake_case) para no tener que transformar al sincronizar.

export type UUID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // timestamptz en ISO 8601

/** Rol de una posición: le dice al generador cómo tratarla (ver DISENO.md §2). */
export type PositionRole = 'top' | 'bottom' | 'full_body' | 'outer' | 'footwear' | 'accessory' | 'extra';

export type Warmth = 'light' | 'medium' | 'warm';
export type GarmentStatus = 'available' | 'laundry' | 'archived';
export type Weather = 'hot' | 'mild' | 'cold';
export type EventKind = 'shown' | 'reject_strong' | 'reject_weak';

/** Columnas comunes a todas las tablas sincronizadas. */
export interface SyncedRow {
  user_id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface Position extends SyncedRow {
  id: UUID;
  name: string;
  role: PositionRole;
  max_items: number;
  sort_order: number;
}

export interface GarmentType extends SyncedRow {
  id: UUID;
  name: string;
  position_id: UUID;
  default_wash_uses: number;
  default_warmth: Warmth;
  sort_order: number;
}

export interface Style extends SyncedRow {
  id: UUID;
  name: string;
  sort_order: number;
}

export interface Garment extends SyncedRow {
  id: UUID;
  name: string;
  type_id: UUID;
  style_ids: UUID[];
  color: string | null;
  warmth: Warmth;
  /** 0 = nunca va al cesto automáticamente. */
  wash_after_uses: number;
  uses_since_wash: number;
  status: GarmentStatus;
  notes: string | null;
  photo_path: string | null;
  stats_reset_at: ISODateTime | null;
  is_sample: boolean;
}

/** Nivel 1. style_a < style_b. */
export interface StyleCompat extends SyncedRow {
  style_a: UUID;
  style_b: UUID;
  compatible: boolean;
}

/** Nivel 2. type_a < type_b. */
export interface TypeRule extends SyncedRow {
  type_a: UUID;
  type_b: UUID;
  allowed: boolean;
}

/** Nivel 3. garment_a < garment_b. */
export interface GarmentRule extends SyncedRow {
  garment_a: UUID;
  garment_b: UUID;
  allowed: boolean;
}

/** Filtros guardables del generador (lo que va en un preset). */
export interface GeneratorFilters {
  excludedGarmentIds: UUID[];
  excludedTypeIds: UUID[];
  excludedStyleIds: UUID[];
  targetStyleId: UUID | null;
  weather: Weather | null;
}

export interface Preset extends SyncedRow {
  id: UUID;
  name: string;
  config: Partial<GeneratorFilters>;
  sort_order: number;
}

export interface Outfit extends SyncedRow {
  id: UUID;
  name: string;
  tags: string[];
  garment_ids: UUID[];
  favorite: boolean;
  photo_paths: string[];
  notes: string | null;
}

export interface WearLogEntry extends SyncedRow {
  id: UUID;
  worn_on: ISODate;
  garment_ids: UUID[];
  outfit_id: UUID | null;
}

export interface GarmentEvent extends SyncedRow {
  id: UUID;
  kind: EventKind;
  garment_ids: UUID[];
}

export interface UserPrefs {
  /** "Prendas que no uso desde hace X días". */
  unusedDays: number;
  /** Apariciones mínimas antes de marcar una prenda como evitada. */
  minAppearances: number;
  /** Peso del rechazo débil (regenerar todo) frente al fuerte (= 1). */
  weakRejectWeight: number;
  /** Tasa de rechazo a partir de la cual una prenda se considera evitada. */
  avoidThreshold: number;
  /** Último resumen mensual marcado como visto, 'YYYY-MM'. */
  lastSummaryMonth: string | null;
}

export interface UserSettings extends SyncedRow {
  prefs: Partial<UserPrefs>;
}

export const DEFAULT_PREFS: UserPrefs = {
  unusedDays: 60,
  minAppearances: 5,
  weakRejectWeight: 0.25,
  avoidThreshold: 0.5,
  lastSummaryMonth: null,
};

export const EMPTY_FILTERS: GeneratorFilters = {
  excludedGarmentIds: [],
  excludedTypeIds: [],
  excludedStyleIds: [],
  targetStyleId: null,
  weather: null,
};

/** Todo el catálogo + reglas, ya sin filas borradas. */
export interface Catalog {
  positions: Position[];
  types: GarmentType[];
  styles: Style[];
  styleCompat: StyleCompat[];
  typeRules: TypeRule[];
  garmentRules: GarmentRule[];
}

export const ROLE_LABELS: Record<PositionRole, string> = {
  top: 'Parte superior (obligatoria)',
  bottom: 'Parte inferior (obligatoria)',
  full_body: 'Pieza completa (sustituye superior e inferior)',
  footwear: 'Calzado (obligatorio)',
  outer: 'Capa exterior (opcional, depende del clima)',
  accessory: 'Accesorios (opcionales, varios a la vez)',
  extra: 'Otra opcional (máximo una prenda)',
};

export const WARMTH_LABELS: Record<Warmth, string> = {
  light: 'Ligera',
  medium: 'Media',
  warm: 'Abrigadora',
};

export const STATUS_LABELS: Record<GarmentStatus, string> = {
  available: 'Disponible',
  laundry: 'En el cesto',
  archived: 'Archivada',
};

export const WEATHER_LABELS: Record<Weather, string> = {
  hot: 'Calor',
  mild: 'Templado',
  cold: 'Frío',
};
