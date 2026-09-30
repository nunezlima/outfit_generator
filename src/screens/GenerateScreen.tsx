// Pantalla "Generar": opciones + resultado.
//
// Eventos que alimentan el detector de prendas evitadas:
//   · outfit generado                 → "shown" para las prendas nuevas
//   · regenerar con los mismos filtros → "reject_weak" para las no bloqueadas
//   · cambiar una prenda con su botón  → "reject_strong" para esa prenda

import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, Lock, LockOpen, Palette, Plus, RefreshCw, Save, Settings, Shapes, Shirt, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWardrobeAnalysis } from '../app/analysisHook';
import { useGeneratorState } from '../app/generatorState';
import { getDB } from '../data/db';
import { useGarments, useUsage } from '../data/hooks';
import { logEvent } from '../data/repo';
import { loadSampleData } from '../data/sample';
import { colorAdvice } from '../domain/colors';
import { generateOutfit, pickForPosition, type GenerationFailure, type GeneratorContext, type OutfitItem } from '../domain/generator';
import type { Garment, Position } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { EmptyState, Loading, Page } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto } from '../ui/GarmentViews';
import { SaveOutfitSheet, WearSheet } from '../ui/OutfitSheets';
import { GeneratorOptions } from './generate/GeneratorOptions';

export function GenerateScreen() {
  const garments = useGarments();
  const idx = useCatalogIndex();
  const { summaryPending, analysis } = useWardrobeAnalysis();
  // ¿Ya se comprobó/sembró el catálogo inicial? (si sí y está vacío, es porque se borró)
  const seeded = useLiveQuery(async () => !!(await getDB().meta.get('catalogSeedChecked'))?.value, []) ?? false;

  if (!garments) return <Loading />;
  return (
    <Page
      title="Generar outfit"
      actions={
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes">
          <Settings />
        </Link>
      }
    >
      {idx.catalog.positions.length === 0 ? (
        seeded ? (
          <EmptyState icon={<Shapes />} title="No tienes categorías" text="Sin posiciones ni tipos no se pueden armar outfits. Crea algunas o restaura un respaldo.">
            <Link to="/ajustes/categorias?t=positions" className="btn primary">
              Ir a Categorías
            </Link>
            <Link to="/ajustes" className="btn ghost">
              Restaurar respaldo
            </Link>
          </EmptyState>
        ) : (
          <EmptyState icon={<Sparkles />} title="Preparando tu catálogo…" text="La primera vez se descargan las categorías iniciales. Si no tienes internet, conéctate un momento." />
        )
      ) : garments.length === 0 ? (
        <FirstRun />
      ) : (
        <div className="stack-lg">
          {summaryPending && analysis && (
            <Link to="/analisis" className="callout info" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Sparkles />
              <span>
                <b>Resumen del mes:</b> {analysis.summary.length} {analysis.summary.length === 1 ? 'prenda que quizá ya no te gusta' : 'prendas que quizá ya no te gustan'}. Toca para verlas.
              </span>
            </Link>
          )}
          <GeneratorOptions garments={garments} />
          <Generator garments={garments} />
        </div>
      )}
    </Page>
  );
}

function FirstRun() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const ok = await confirm({
      title: 'Cargar datos de ejemplo',
      message: 'Se agregan ~35 prendas, 4 outfits e historial FICTICIOS para probar. Después puedes borrarlos desde Ajustes.',
      confirmText: 'Cargar',
    });
    if (!ok) return;
    setBusy(true);
    const n = await loadSampleData();
    setBusy(false);
    toast(`${n} prendas de ejemplo cargadas`);
  };
  return (
    <EmptyState icon={<Shirt />} title="Tu guardarropa está vacío" text="Agrega tus prendas (con foto, si quieres) o carga datos de ejemplo para probar la app.">
      <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
        <button className="btn primary big block" onClick={() => navigate('/guardarropa/nueva')}>
          <Plus /> Agregar mi primera prenda
        </button>
        <button className="btn block" onClick={() => void load()} disabled={busy}>
          <Sparkles /> {busy ? 'Cargando…' : 'Cargar datos de ejemplo'}
        </button>
      </div>
    </EmptyState>
  );
}

function Generator({ garments }: { garments: Garment[] }) {
  const idx = useCatalogIndex();
  const usage = useUsage();
  const gen = useGeneratorState();
  const { toast } = useFeedback();
  const [slotError, setSlotError] = useState<GenerationFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [wearing, setWearing] = useState(false);

  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const ctx: GeneratorContext = useMemo(() => ({ garments, catalog: idx.catalog, filters: gen.filters, usage }), [garments, idx.catalog, gen.filters, usage]);
  const key = JSON.stringify({ f: gen.filters, p: gen.pinned });
  const result = gen.result;
  const items = result?.ok ? result.items.filter((i) => byId.has(i.garmentId)) : [];
  const ids = items.map((i) => i.garmentId);

  const generate = () => {
    setSlotError(null);
    const previous = ids;
    // Las fijadas y bloqueadas las eligió el usuario: no cuentan como
    // "mostradas" ni como rechazadas.
    const chosenByUser = new Set([...gen.pinned, ...gen.locked]);
    // Regenerar con los mismos filtros = rechazo débil de lo que no bloqueaste.
    if (previous.length && gen.resultKey === key) void logEvent('reject_weak', previous.filter((id) => !chosenByUser.has(id)));
    const r = generateOutfit(ctx, { pinnedIds: [...chosenByUser], previousIds: previous });
    gen.setResult(r, key);
    if (r.ok) void logEvent('shown', r.items.map((i) => i.garmentId).filter((id) => !chosenByUser.has(id)));
  };

  const setItems = (next: OutfitItem[]) => {
    const order = new Map(idx.catalog.positions.map((p, i) => [p.id, i]));
    gen.setItems([...next].sort((a, b) => (order.get(a.positionId) ?? 0) - (order.get(b.positionId) ?? 0)));
  };

  const change = (item: OutfitItem) => {
    const r = pickForPosition(ctx, ids, item.positionId, item.garmentId);
    if (!r.ok) {
      setSlotError(r);
      return;
    }
    setSlotError(null);
    void logEvent('reject_strong', [item.garmentId]);
    void logEvent('shown', [r.garmentId]);
    setItems(items.map((i) => (i.garmentId === item.garmentId ? { ...i, garmentId: r.garmentId } : i)));
  };

  const add = (p: Position) => {
    const r = pickForPosition(ctx, ids, p.id);
    if (!r.ok) {
      setSlotError(r);
      return;
    }
    setSlotError(null);
    void logEvent('shown', [r.garmentId]);
    setItems([...items, { positionId: p.id, garmentId: r.garmentId }]);
  };

  const remove = (item: OutfitItem) => setItems(items.filter((i) => i.garmentId !== item.garmentId));

  // Posiciones opcionales que aún admiten una prenda más.
  const hasFull = items.some((i) => idx.positionById.get(i.positionId)?.role === 'full_body');
  const addable = idx.catalog.positions.filter((p) => {
    const n = items.filter((i) => i.positionId === p.id).length;
    if (p.role === 'outer' || p.role === 'extra' || p.role === 'mid') return n === 0;
    // Si la capa intermedia va sola, se puede agregar una prenda ligera debajo.
    if (p.role === 'top') return n === 0 && !hasFull;
    if (p.role === 'accessory') return n < p.max_items;
    return false;
  });
  const advice = colorAdvice(ids.map((id) => byId.get(id)?.color));
  const isOptional = (p?: Position) => !!p && (p.role === 'outer' || p.role === 'extra' || p.role === 'mid' || p.role === 'accessory');

  return (
    <div className="stack">
      <button className="btn primary big block" onClick={generate}>
        {result ? <RefreshCw /> : <Sparkles />}
        {result ? (gen.locked.length ? 'Regenerar lo no bloqueado' : 'Regenerar') : 'Generar outfit'}
      </button>

      {result && !result.ok && <FailureCard failure={result} />}

      {result?.ok && items.length > 0 && (
        <div className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((item) => {
            const g = byId.get(item.garmentId)!;
            const p = idx.positionById.get(item.positionId);
            const locked = gen.locked.includes(g.id);
            return (
              <div key={item.garmentId} className={`outfit-item${locked ? ' locked' : ''}`}>
                <Link to={`/guardarropa/${g.id}`} aria-label={`Ver ${g.name}`}>
                  <GarmentPhoto garment={g} className="thumb lg" />
                </Link>
                <div className="grow">
                  <div className="pos">{p?.name ?? ''}</div>
                  <div className="name">{g.name}</div>
                  <div className="tiny muted ellipsis">{idx.styleNames(g.style_ids).join(' · ')}</div>
                </div>
                <div className="actions">
                  <button className={`icon-btn${locked ? ' on' : ''}`} aria-pressed={locked} aria-label={locked ? `Desbloquear ${g.name}` : `Bloquear ${g.name}`} title={locked ? 'Bloqueada' : 'Bloquear'} onClick={() => gen.toggleLock(g.id)}>
                    {locked ? <Lock /> : <LockOpen />}
                  </button>
                  <button className="icon-btn" aria-label={`Cambiar ${g.name}`} title="Cambiar solo esta prenda" onClick={() => change(item)} disabled={locked}>
                    <RefreshCw />
                  </button>
                  {isOptional(p) && (
                    <button className="icon-btn" aria-label={`Quitar ${g.name}`} title="Quitar" onClick={() => remove(item)} disabled={locked}>
                      <X />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {addable.length > 0 && (
            <div className="outfit-add">
              {addable.map((p) => (
                <button key={p.id} className="btn sm" onClick={() => add(p)} disabled={hasFull && (p.role === 'top' || p.role === 'bottom')}>
                  <Plus /> {p.role === 'accessory' ? 'Accesorio' : p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {slotError && <FailureCard failure={slotError} onClose={() => setSlotError(null)} />}

      {result?.ok && (
        <>
          {advice.tone !== 'none' && (
            <div className={`callout ${advice.tone === 'good' ? 'good' : 'warn'}`}>
              <Palette />
              <span>{advice.message}</span>
            </div>
          )}
          {result.notes.map((n) => (
            <div key={n} className="callout warn">
              <TriangleAlert />
              <span>{n}</span>
            </div>
          ))}
          {gen.locked.length > 0 && <p className="hint center">🔒 Las prendas bloqueadas se mantienen al regenerar.</p>}
          <div className="btn-row">
            <button className="btn" onClick={() => setSaving(true)}>
              <Save /> Guardar
            </button>
            <button className="btn soft" onClick={() => setWearing(true)}>
              <CalendarCheck /> Lo usé hoy
            </button>
          </div>
        </>
      )}

      {!result && <p className="hint center">Tip: bloquea una prenda (🔒) para conservarla y regenerar el resto.</p>}

      {saving && <SaveOutfitSheet garmentIds={ids} defaultName={defaultName(items, byId, idx.positionById)} onClose={() => setSaving(false)} />}
      {wearing && (
        <WearSheet
          garmentIds={ids}
          outfitId={null}
          defaultName={defaultName(items, byId, idx.positionById)}
          onClose={() => setWearing(false)}
          onDone={() => {
            gen.setResult(null);
            gen.setLocked([]);
            toast('¡Listo! Genera otro cuando quieras.');
          }}
        />
      )}
    </div>
  );
}

function defaultName(items: OutfitItem[], byId: Map<string, Garment>, positions: Map<string, Position>): string {
  const main =
    items.find((i) => ['top', 'full_body'].includes(positions.get(i.positionId)?.role ?? '')) ??
    items.find((i) => positions.get(i.positionId)?.role === 'mid');
  const g = main ? byId.get(main.garmentId) : undefined;
  return g ? `Con ${g.name.charAt(0).toLocaleLowerCase('es')}${g.name.slice(1)}` : 'Mi outfit';
}

export function FailureCard({ failure, onClose }: { failure: GenerationFailure; onClose?: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <TriangleAlert />
      <div className="grow">
        <b>{failure.message}</b>
        {failure.details.length > 0 && (
          <ul>
            {failure.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        {failure.hints.length > 0 && (
          <p className="small" style={{ marginTop: 6 }}>
            <b>Qué puedes hacer:</b> {failure.hints.join(' ')}
          </p>
        )}
      </div>
      {onClose && (
        <button className="icon-btn sm" aria-label="Cerrar" onClick={onClose}>
          <X />
        </button>
      )}
    </div>
  );
}
