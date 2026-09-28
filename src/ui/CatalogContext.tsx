// Catálogo (posiciones, tipos, estilos, reglas) disponible en toda la app,
// con búsquedas rápidas por id.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useCatalog } from '../data/hooks';
import type { Catalog, GarmentType, Position, PositionRole, Style, UUID } from '../domain/types';

export interface CatalogIndex {
  catalog: Catalog;
  typeById: Map<UUID, GarmentType>;
  positionById: Map<UUID, Position>;
  styleById: Map<UUID, Style>;
  positionOfType: (typeId: UUID) => Position | undefined;
  roleOfType: (typeId: UUID) => PositionRole | undefined;
  typeName: (typeId: UUID) => string;
  styleNames: (ids: UUID[]) => string[];
}

const Ctx = createContext<CatalogIndex | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  const value = useMemo<CatalogIndex | null>(() => {
    if (!catalog) return null;
    const typeById = new Map(catalog.types.map((t) => [t.id, t]));
    const positionById = new Map(catalog.positions.map((p) => [p.id, p]));
    const styleById = new Map(catalog.styles.map((s) => [s.id, s]));
    const positionOfType = (typeId: UUID) => {
      const t = typeById.get(typeId);
      return t ? positionById.get(t.position_id) : undefined;
    };
    return {
      catalog,
      typeById,
      positionById,
      styleById,
      positionOfType,
      roleOfType: (typeId) => positionOfType(typeId)?.role,
      typeName: (typeId) => typeById.get(typeId)?.name ?? 'Sin tipo',
      styleNames: (ids) => ids.map((id) => styleById.get(id)?.name).filter((x): x is string => !!x),
    };
  }, [catalog]);
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalogIndex(): CatalogIndex {
  const v = useContext(Ctx);
  if (!v) throw new Error('CatalogProvider falta');
  return v;
}
