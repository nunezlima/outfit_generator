// Estado del generador compartido por la app: sobrevive al cambiar de
// pestaña. Los filtros se recuerdan en este dispositivo (localStorage).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GenerationResult, OutfitItem } from '../domain/generator';
import { EMPTY_FILTERS, type GeneratorFilters, type UUID } from '../domain/types';

const KEY = 'guardarropa:generator-filters';

export interface GeneratorState {
  filters: GeneratorFilters;
  presetId: UUID | null;
  /** Prendas fijadas antes de generar ("quiero usar esta camisa"). */
  pinned: UUID[];
  /** Resultado actual (éxito o explicación del fallo). */
  result: GenerationResult | null;
  /** Prendas bloqueadas dentro del resultado. */
  locked: UUID[];
  /** Filtros con los que se generó el resultado (para saber si "regenerar" es un rechazo). */
  resultKey: string | null;
}

interface Api extends GeneratorState {
  setFilters: (f: GeneratorFilters, presetId?: UUID | null) => void;
  setPinned: (ids: UUID[]) => void;
  setResult: (r: GenerationResult | null, key?: string | null) => void;
  setItems: (items: OutfitItem[]) => void;
  toggleLock: (id: UUID) => void;
  setLocked: (ids: UUID[]) => void;
}

const Ctx = createContext<Api | null>(null);

function loadFilters(): { filters: GeneratorFilters; presetId: UUID | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { filters: { ...EMPTY_FILTERS, ...v.filters }, presetId: v.presetId ?? null };
    }
  } catch {
    /* ignorar */
  }
  return { filters: EMPTY_FILTERS, presetId: null };
}

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GeneratorState>(() => ({ ...loadFilters(), pinned: [], result: null, locked: [], resultKey: null }));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ filters: state.filters, presetId: state.presetId }));
    } catch {
      /* ignorar */
    }
  }, [state.filters, state.presetId]);

  const setFilters = useCallback((filters: GeneratorFilters, presetId: UUID | null = null) => setState((s) => ({ ...s, filters, presetId })), []);
  const setPinned = useCallback((pinned: UUID[]) => setState((s) => ({ ...s, pinned })), []);
  const setResult = useCallback(
    (result: GenerationResult | null, resultKey: string | null = null) =>
      setState((s) => ({ ...s, result, resultKey, locked: result && result.ok ? s.locked.filter((id) => result.items.some((i) => i.garmentId === id)) : s.locked })),
    [],
  );
  const setItems = useCallback(
    (items: OutfitItem[]) => setState((s) => (s.result && s.result.ok ? { ...s, result: { ...s.result, items }, locked: s.locked.filter((id) => items.some((i) => i.garmentId === id)) } : s)),
    [],
  );
  const toggleLock = useCallback((id: UUID) => setState((s) => ({ ...s, locked: s.locked.includes(id) ? s.locked.filter((x) => x !== id) : [...s.locked, id] })), []);
  const setLocked = useCallback((locked: UUID[]) => setState((s) => ({ ...s, locked })), []);

  return <Ctx.Provider value={{ ...state, setFilters, setPinned, setResult, setItems, toggleLock, setLocked }}>{children}</Ctx.Provider>;
}

export function useGeneratorState(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('GeneratorProvider falta');
  return v;
}
