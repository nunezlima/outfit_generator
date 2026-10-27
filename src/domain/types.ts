// Tipos del dominio. Los nombres de campos coinciden con las columnas de la
// base de datos (snake_case) para no tener que transformar al sincronizar.

export type UUID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // timestamptz en ISO 8601

/** Rol de una posición: le dice al generador cómo tratarla (ver DISENO.md §2). */
export type PositionRole = 'top' | 'mid' | 'bottom' | 'full_body' | 'outer' | 'footwear' | 'accessory' | 'extra';

export type Warmth = 'light' | 'medium' | 'warm';
export type GarmentStatus = 'available' | 'laundry' | 'archived';
/** Clima del día para la ropa: sol, lluvia o frío. */
export type Weather = 'sun' | 'rain' | 'cold';
/**
 * Clima en el que se usa una prenda: 'hot' = de sol (antes "calor"),
 * 'all' = todo el año, 'cold' = de frío. El valor 'hot' se conserva en la
 * base de datos para no migrar filas; en la interfaz se llama "Sol".
 */
export type Climate = 'hot' | 'all' | 'cold';
/** Clima del perfume: independiente del clima de la ropa. */
export type PerfumeClimate = 'hot' | 'mild' | 'cold';
export type PerfumeStatus = 'available' | 'archived';
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
  /** Temporada de la prenda. Filas viejas sin este campo cuentan como 'all'. */
  climate: Climate;
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
  /** Ocasión elegida (define estilos permitidos y perfumes). null = "Todo". */
  occasionId: UUID | null;
}

/** Ya no se muestran en la app (los reemplazaron los eventos); se conservan los datos. */
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
  /** Perfume que usaste ese día (filas viejas no lo tienen). */
  perfume_id?: UUID | null;
}

/** Evento del generador (Ejercicio, Pulcro, Íntimo…): agrupa ocasiones. */
export interface OutfitEvent extends SyncedRow {
  id: UUID;
  name: string;
  sort_order: number;
}

/**
 * Ocasión dentro de un evento. Decide qué estilos de ropa se permiten y qué
 * perfumes se sugieren en cada clima (el primero de cada lista es el
 * principal; los demás, secundarios).
 */
export interface Occasion extends SyncedRow {
  id: UUID;
  event_id: UUID;
  name: string;
  style_ids: UUID[];
  perfumes_hot: UUID[];
  perfumes_mild: UUID[];
  perfumes_cold: UUID[];
  sort_order: number;
}

export interface Perfume extends SyncedRow {
  id: UUID;
  name: string;
  notes: string | null;
  status: PerfumeStatus;
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
  occasionId: null,
};

/** Todo el catálogo + reglas, ya sin filas borradas. */
export interface Catalog {
  positions: Position[];
  types: GarmentType[];
  styles: Style[];
  styleCompat: StyleCompat[];
  typeRules: TypeRule[];
  garmentRules: GarmentRule[];
  /** Eventos y ocasiones del generador (ordenados). */
  events: OutfitEvent[];
  occasions: Occasion[];
}

export const ROLE_LABELS: Record<PositionRole, string> = {
  top: 'Parte superior (obligatoria, salvo que vaya sola la capa intermedia)',
  mid: 'Capa intermedia (opcional; puede ir sola arriba)',
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

export const CLIMATE_LABELS: Record<Climate, string> = {
  hot: 'Sol',
  all: 'Todo el año',
  cold: 'Frío',
};

export const PERFUME_CLIMATE_LABELS: Record<PerfumeClimate, string> = {
  hot: 'Calor',
  mild: 'Templado',
  cold: 'Frío',
};

export const STATUS_LABELS: Record<GarmentStatus, string> = {
  available: 'Disponible',
  laundry: 'En el cesto',
  archived: 'Archivada',
};

export const WEATHER_LABELS: Record<Weather, string> = {
  sun: 'Sol',
  rain: 'Lluvia',
  cold: 'Frío',
};
