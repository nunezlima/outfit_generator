// Estado del generador compartido por la app: sobrevive al cambiar de
// pestaña. Los filtros se recuerdan en este dispositivo (localStorage).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GenerationResult, OutfitItem } from '../domain/generator';
import { climateForDate, type PerfumePick } from '../domain/perfumes';
import { EMPTY_FILTERS, type GeneratorFilters, type PerfumeClimate, type UUID, type Weather } from '../domain/types';

const KEY = 'guardarropa:generator-filters';

/** Al cerrar sesión: los filtros (id de prendas y estilos) son de esa cuenta. */
export function forgetGeneratorFilters(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}

export interface GeneratorState {
  filters: GeneratorFilters;
  /** Prendas fijadas antes de generar ("quiero usar esta camisa"). */
  pinned: UUID[];
  /** Resultado actual (éxito o explicación del fallo). */
  result: GenerationResult | null;
  /** Prendas bloqueadas dentro del resultado. */
  locked: UUID[];
  /** Filtros con los que se generó el resultado (para saber si "regenerar" es un rechazo). */
  resultKey: string | null;
  /** Perfume del outfit actual (o null si no hay ninguno que sugerir). */
  perfume: PerfumePick | null;
  perfumeLocked: boolean;
  /** Clima del perfume: empieza según el mes y lo cambias tú. Independiente del clima de la ropa. */
  perfumeClimate: PerfumeClimate;
}

interface Api extends GeneratorState {
  setFilters: (f: GeneratorFilters) => void;
  setPinned: (ids: UUID[]) => void;
  setResult: (r: GenerationResult | null, key?: string | null) => void;
  setItems: (items: OutfitItem[]) => void;
  toggleLock: (id: UUID) => void;
  setLocked: (ids: UUID[]) => void;
  setPerfume: (p: PerfumePick | null) => void;
  setPerfumeLocked: (v: boolean) => void;
  setPerfumeClimate: (c: PerfumeClimate) => void;
}

const Ctx = createContext<Api | null>(null);

/** Filtros guardados por versiones anteriores: el clima era calor/templado/frío. */
function migrateWeather(w: unknown): Weather | null {
  if (w === 'sun' || w === 'rain' || w === 'cold') return w;
  if (w === 'hot') return 'sun';
  return null;
}

function loadFilters(): GeneratorFilters {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      const f = { ...EMPTY_FILTERS, ...v.filters };
      return { ...f, weather: migrateWeather(f.weather) };
    }
  } catch {
    /* ignorar */
  }
  return EMPTY_FILTERS;
}

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GeneratorState>(() => ({
    filters: loadFilters(),
    pinned: [],
    result: null,
    locked: [],
    resultKey: null,
    perfume: null,
    perfumeLocked: false,
    perfumeClimate: climateForDate(),
  }));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ filters: state.filters }));
    } catch {
      /* ignorar */
    }
  }, [state.filters]);

  const setFilters = useCallback((filters: GeneratorFilters) => setState((s) => ({ ...s, filters })), []);
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
  const setPerfume = useCallback((perfume: PerfumePick | null) => setState((s) => ({ ...s, perfume, perfumeLocked: perfume ? s.perfumeLocked : false })), []);
  const setPerfumeLocked = useCallback((perfumeLocked: boolean) => setState((s) => ({ ...s, perfumeLocked })), []);
  const setPerfumeClimate = useCallback((perfumeClimate: PerfumeClimate) => setState((s) => ({ ...s, perfumeClimate })), []);

  return (
    <Ctx.Provider value={{ ...state, setFilters, setPinned, setResult, setItems, toggleLock, setLocked, setPerfume, setPerfumeLocked, setPerfumeClimate }}>{children}</Ctx.Provider>
  );
}

export function useGeneratorState(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('GeneratorProvider falta');
  return v;
}
