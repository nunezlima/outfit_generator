// Guardarropa: cuadrícula con fotos, búsqueda y filtros (tipo, estilo,
// color y estado). Los filtros viven en la URL y además se recuerdan (ver
// app/wardrobeView.ts) para conservarse al editar una prenda y volver.
// Modo selección: elegir varias prendas y editarlas juntas.

import { Check, CheckSquare, Pencil, Plus, Shirt, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getWardrobeView, rememberWardrobeScroll, rememberWardrobeSearch } from '../app/wardrobeView';
import { useGarments } from '../data/hooks';
import { getColor, PALETTE } from '../domain/colors';
import type { Garment } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { Chip, EmptyState, Loading, Page, SearchInput, normalize } from '../ui/common';
import { GarmentCard } from '../ui/GarmentViews';
import { Sheet } from '../ui/Sheet';
import { BulkEditSheet } from './wardrobe/BulkEditSheet';

type StatusFilter = 'active' | 'available' | 'laundry' | 'archived' | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'En uso' },
  { value: 'available', label: 'Disponibles' },
  { value: 'laundry', label: 'En el cesto' },
  { value: 'archived', label: 'Archivadas' },
  { value: 'all', label: 'Todas' },
];

export function WardrobeScreen() {
  const garments = useGarments();
  const idx = useCatalogIndex();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Al entrar sin filtros en la URL (barra de navegación, botón Volver),
  // recuperar los últimos que usaste.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = getWardrobeView().search;
    if (params.toString() === '' && saved) setParams(new URLSearchParams(saved), { replace: true });
  }, [params, setParams]);

  // Guardar los filtros cada vez que cambian (ya restaurados).
  const search = params.toString();
  useEffect(() => {
    if (restored.current) rememberWardrobeSearch(search);
  }, [search]);

  // Recordar el scroll al salir y volver a él al regresar.
  const scrollRestored = useRef(false);
  // (Se guarda mientras haces scroll: al desmontar, la página nueva ya pudo moverlo.)
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => rememberWardrobeScroll(window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  useEffect(() => {
    if (scrollRestored.current || !garments) return;
    scrollRestored.current = true;
    const y = getWardrobeView().scrollY;
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [garments]);

  const q = params.get('q') ?? '';
  const status = (params.get('estado') as StatusFilter) ?? 'active';
  const typeId = params.get('tipo');
  const styleId = params.get('estilo');
  const color = params.get('color');

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const shown = useMemo(() => {
    if (!garments) return [];
    const nq = normalize(q.trim());
    return garments.filter((g: Garment) => {
      if (status === 'active' && g.status === 'archived') return false;
      if (status !== 'active' && status !== 'all' && g.status !== status) return false;
      if (typeId && g.type_id !== typeId) return false;
      if (styleId && !g.style_ids.includes(styleId)) return false;
      if (color && g.color !== color) return false;
      if (nq && !normalize(`${g.name} ${idx.typeName(g.type_id)} ${g.notes ?? ''} ${getColor(g.color)?.label ?? ''}`).includes(nq)) return false;
      return true;
    });
  }, [garments, q, status, typeId, styleId, color, idx]);

  if (!garments) return <Loading />;

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const allShownSelected = shown.length > 0 && shown.every((g) => selected.has(g.id));
  const selectedGarments = garments.filter((g) => selected.has(g.id));

  const activeFilters = [
    typeId && { key: 'tipo', label: idx.typeName(typeId) },
    styleId && { key: 'estilo', label: idx.styleById.get(styleId)?.name ?? 'Estilo' },
    color && { key: 'color', label: getColor(color)?.label ?? color },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <Page
      title={selecting ? `${selected.size} ${selected.size === 1 ? 'seleccionada' : 'seleccionadas'}` : 'Guardarropa'}
      actions={
        garments.length > 0 &&
        (selecting ? (
          <button className="btn sm" onClick={exitSelection}>
            Listo
          </button>
        ) : (
          <button className="icon-btn" onClick={() => setSelecting(true)} aria-label="Seleccionar varias">
            <CheckSquare />
          </button>
        ))
      }
    >
      {garments.length === 0 ? (
        <EmptyState icon={<Shirt />} title="Aún no tienes prendas" text="Agrega tu ropa con foto, tipo y estilos para empezar a generar outfits.">
          <button className="btn primary" onClick={() => navigate('/guardarropa/nueva')}>
            <Plus /> Agregar prenda
          </button>
          <button className="btn ghost" onClick={() => navigate('/')}>
            <Sparkles /> O carga datos de ejemplo desde Generar
          </button>
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="row">
            <div className="grow">
              <SearchInput value={q} onChange={(v) => set('q', v || null)} placeholder="Buscar por nombre, tipo, color…" />
            </div>
            <button className={`icon-btn${activeFilters.length ? ' on' : ''}`} onClick={() => setFiltersOpen(true)} aria-label="Filtros">
              <SlidersHorizontal />
            </button>
          </div>
          <div className="chips scroll">
            {STATUS_OPTIONS.map((o) => (
              <Chip key={o.value} on={status === o.value} onClick={() => set('estado', o.value === 'active' ? null : o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          {activeFilters.length > 0 && (
            <div className="chips">
              {activeFilters.map((f) => (
                <button key={f.key} className="chip on" onClick={() => set(f.key, null)} aria-label={`Quitar filtro ${f.label}`}>
                  {f.label} <X />
                </button>
              ))}
            </div>
          )}
          <div className="spread">
            <p className="small muted">
              {shown.length} {shown.length === 1 ? 'prenda' : 'prendas'}
            </p>
            {selecting && shown.length > 0 && (
              <button
                className="btn sm ghost"
                onClick={() =>
                  setSelected((cur) => {
                    const next = new Set(cur);
                    for (const g of shown) {
                      if (allShownSelected) next.delete(g.id);
                      else next.add(g.id);
                    }
                    return next;
                  })
                }
              >
                {allShownSelected ? 'Quitar las mostradas' : `Seleccionar las ${shown.length}`}
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<SlidersHorizontal />} title="Sin resultados" text="Prueba con otra búsqueda o quita filtros." />
          ) : (
            <div className="garment-grid">
              {shown.map((g) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selecting && selected.has(g.id)}
                  corner={selecting ? <span className={`select-dot${selected.has(g.id) ? ' on' : ''}`}>{selected.has(g.id) && <Check />}</span> : null}
                  onClick={() => (selecting ? toggle(g.id) : navigate(`/guardarropa/${g.id}`))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selecting ? (
        <div className="select-bar">
          <span className="small">
            {selected.size === 0 ? 'Toca las prendas para elegirlas' : `${selected.size} ${selected.size === 1 ? 'prenda' : 'prendas'}`}
          </span>
          {selected.size > 0 && (
            <button className="btn sm ghost" onClick={() => setSelected(new Set())}>
              Ninguna
            </button>
          )}
          <button className="btn sm primary" disabled={selected.size === 0} onClick={() => setBulkOpen(true)}>
            <Pencil /> Editar
          </button>
        </div>
      ) : (
        <button className="fab" onClick={() => navigate('/guardarropa/nueva')} aria-label="Agregar prenda">
          <Plus />
        </button>
      )}

      {bulkOpen && <BulkEditSheet garments={selectedGarments} onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); exitSelection(); }} />}

      {filtersOpen && (
        <Sheet
          title="Filtros"
          onClose={() => setFiltersOpen(false)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  ['tipo', 'estilo', 'color'].forEach((k) => next.delete(k));
                  setParams(next, { replace: true });
                }}
              >
                Limpiar
              </button>
              <button className="btn primary" onClick={() => setFiltersOpen(false)}>
                Ver {shown.length}
              </button>
            </>
          }
        >
          <div className="stack-lg">
            <div className="field">
              <label htmlFor="f-type">Tipo</label>
              <select id="f-type" className="select" value={typeId ?? ''} onChange={(e) => set('tipo', e.target.value || null)}>
                <option value="">Todos</option>
                {idx.catalog.positions.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {idx.catalog.types
                      .filter((t) => t.position_id === p.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Estilo</span>
              <div className="chips">
                {idx.catalog.styles.map((s) => (
                  <Chip key={s.id} on={styleId === s.id} onClick={() => set('estilo', styleId === s.id ? null : s.id)}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Color</span>
              <div className="swatch-picker">
                {PALETTE.map((c) => (
                  <button
                    key={c.key}
                    className={`swatch-btn${color === c.key ? ' on' : ''}`}
                    style={{ background: c.hex }}
                    title={c.label}
                    aria-label={c.label}
                    aria-pressed={color === c.key}
                    onClick={() => set('color', color === c.key ? null : c.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </Page>
  );
}
