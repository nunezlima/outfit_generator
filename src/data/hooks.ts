// Hooks de lectura reactiva: se actualizan solos cuando cambia IndexedDB
// (por una edición local o por datos que llegan al sincronizar).

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { computeUsage, type GarmentUsage } from '../domain/analysis';
import {
  DEFAULT_PREFS,
  type Catalog,
  type Garment,
  type GarmentEvent,
  type Outfit,
  type Perfume,
  type Preset,
  type UserPrefs,
  type UUID,
  type WearLogEntry,
} from '../domain/types';
import { getDB, getUserId } from './db';

const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es');

export function useCatalog(): Catalog | undefined {
  return useLiveQuery(async () => {
    const db = getDB();
    const [positions, types, styles, styleCompat, typeRules, garmentRules, events, occasions] = await Promise.all([
      db.positions.toArray(),
      db.garment_types.toArray(),
      db.styles.toArray(),
      db.style_compat.toArray(),
      db.type_rules.toArray(),
      db.garment_rules.toArray(),
      db.outfit_events.toArray(),
      db.occasions.toArray(),
    ]);
    return {
      positions: positions.sort(bySort),
      types: types.sort(bySort),
      styles: styles.sort(bySort),
      styleCompat,
      typeRules,
      garmentRules,
      events: events.sort(bySort),
      occasions: occasions.sort(bySort),
    };
  }, []);
}

export function useGarments(): Garment[] | undefined {
  return useLiveQuery(async () => (await getDB().garments.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es')), []);
}

export function useGarment(id: UUID | undefined): Garment | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDB().garments.get(id)) ?? null) : null), [id]);
}

export function useGarmentMap(garments: Garment[] | undefined): Map<UUID, Garment> {
  return useMemo(() => new Map((garments ?? []).map((g) => [g.id, g])), [garments]);
}

export function useOutfits(): Outfit[] | undefined {
  return useLiveQuery(async () => (await getDB().outfits.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)), []);
}

export function useOutfit(id: UUID | undefined): Outfit | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDB().outfits.get(id)) ?? null) : null), [id]);
}

export function useWearLog(): WearLogEntry[] | undefined {
  return useLiveQuery(async () => (await getDB().wear_log.toArray()).sort((a, b) => b.worn_on.localeCompare(a.worn_on) || b.created_at.localeCompare(a.created_at)), []);
}

export function useEvents(): GarmentEvent[] | undefined {
  return useLiveQuery(() => getDB().garment_events.toArray(), []);
}

export function usePresets(): Preset[] | undefined {
  return useLiveQuery(async () => (await getDB().presets.toArray()).sort(bySort), []);
}

/** Perfumes ordenados por nombre (incluye archivados). */
export function usePerfumes(): Perfume[] | undefined {
  return useLiveQuery(async () => (await getDB().perfumes.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es')), []);
}

export function usePrefs(): UserPrefs {
  const settings = useLiveQuery(() => getDB().user_settings.get(getUserId()), []);
  return useMemo(() => ({ ...DEFAULT_PREFS, ...settings?.prefs }), [settings]);
}

/** Estadísticas de uso de todas las prendas (para pesos y análisis). */
export function useUsage(): Map<UUID, GarmentUsage> | undefined {
  const garments = useGarments();
  const wear = useWearLog();
  const events = useEvents();
  const prefs = usePrefs();
  return useMemo(() => {
    if (!garments || !wear || !events) return undefined;
    return computeUsage(garments, wear, events, prefs);
  }, [garments, wear, events, prefs]);
}

export function useOutboxCounts(): { pending: number; failed: number } {
  return (
    useLiveQuery(async () => {
      const db = getDB();
      return { pending: await db.outbox.count(), failed: await db.failed.count() };
    }, []) ?? { pending: 0, failed: 0 }
  );
}

export function useFailedOps() {
  return useLiveQuery(() => getDB().failed.toArray(), []);
}
