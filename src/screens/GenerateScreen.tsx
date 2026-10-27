// Pantalla "Generar": opciones + resultado.
//
// Eventos que alimentan el detector de prendas evitadas:
//   · outfit generado                 → "shown" para las prendas nuevas
//   · regenerar con los mismos filtros → "reject_weak" para las no bloqueadas
//   · cambiar una prenda con su botón  → "reject_strong" para esa prenda

import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, Lock, LockOpen, Palette, Plus, RefreshCw, Save, Settings, Shapes, Shirt, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWardrobeAnalysis } from '../app/analysisHook';
import { useGeneratorState } from '../app/generatorState';
import { getDB } from '../data/db';
import { useGarments, usePerfumes, useUsage } from '../data/hooks';
import { logEvent } from '../data/repo';
import { loadSampleData } from '../data/sample';
import { colorAdvice } from '../domain/colors';
import { activeOccasion, generateOutfit, pickForPosition, type GenerationFailure, type GeneratorContext, type OutfitItem } from '../domain/generator';
import { hasAlternative, nextPerfume, rankLabel, suggestPerfume, type PerfumeContext } from '../domain/perfumes';
import { PERFUME_CLIMATE_LABELS, type Garment, type Perfume, type PerfumeClimate, type Position } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { EmptyState, Loading, Page, Segmented } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { GarmentPhoto } from '../ui/GarmentViews';
import { PerfumeIcon } from '../ui/icons';
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
                <b>Resumen del mes:</b> {analysis.summary.length} {analysis.summary.length === 1 ? 'prenda que casi no usas' : 'prendas que casi no usas'}. Toca para verlas.
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
  const perfumes = usePerfumes();
  const occasion = activeOccasion(idx.catalog, gen.filters);
  const pctx: PerfumeContext = useMemo(() => ({ occasion, occasions: idx.catalog.occasions, perfumes: perfumes ?? [] }), [occasion, idx.catalog.occasions, perfumes]);
  const perfumeById = useMemo(() => new Map((perfumes ?? []).map((p) => [p.id, p])), [perfumes]);
  const currentPerfume = gen.perfume ? perfumeById.get(gen.perfume.perfumeId) : undefined;

  // Si hay outfit pero aún no hay perfume (p. ej. los perfumes cargaron después,
  // o borraste el que se mostraba), sugerir el principal.
  const hasOutfit = !!gen.result?.ok;
  const { perfume: shownPick, perfumeClimate, setPerfume } = gen;
  useEffect(() => {
    if (!hasOutfit || !perfumes || currentPerfume) return;
    const s = suggestPerfume(pctx, perfumeClimate);
    if (s && s.perfumeId !== shownPick?.perfumeId) setPerfume(s);
  }, [hasOutfit, perfumes, currentPerfume, pctx, perfumeClimate, shownPick, setPerfume]);
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
    // El perfume siempre empieza por el principal (salvo que lo hayas bloqueado).
    if (r.ok && !(gen.perfumeLocked && currentPerfume)) gen.setPerfume(suggestPerfume(pctx, gen.perfumeClimate));
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
          {perfumes && perfumes.length > 0 && <PerfumeRow perfume={currentPerfume} ctx={pctx} />}
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
          perfume={currentPerfume ? { id: currentPerfume.id, name: currentPerfume.name } : null}
          onClose={() => setWearing(false)}
          onDone={() => {
            gen.setResult(null);
            gen.setLocked([]);
            gen.setPerfume(null);
            toast('¡Listo! Genera otro cuando quieras.');
          }}
        />
      )}
    </div>
  );
}

/**
 * Fila del perfume, al final del outfit. El clima del perfume (calor,
 * templado, frío) es independiente del clima de la ropa: empieza según el mes
 * y lo cambias aquí. Regenerar pasa al secundario de la misma lista.
 */
function PerfumeRow({ perfume, ctx }: { perfume: Perfume | undefined; ctx: PerfumeContext }) {
  const gen = useGeneratorState();
  const { toast } = useFeedback();
  const pick = perfume ? gen.perfume : null;
  const locked = gen.perfumeLocked && !!pick;

  const chooseClimate = (c: PerfumeClimate) => {
    gen.setPerfumeClimate(c);
    gen.setPerfume(suggestPerfume(ctx, c));
  };
  const regenerate = () => {
    if (!pick) return;
    const next = nextPerfume(ctx, pick);
    if (next) gen.setPerfume(next);
    else toast('No hay otro perfume para este evento y clima.');
  };

  let detail: string;
  if (!pick) detail = ctx.occasion ? `“${ctx.occasion.name}” no tiene perfumes asignados.` : 'No hay perfumes disponibles.';
  else if (pick.climate !== pick.requested)
    detail = `${rankLabel(pick)} · No hay de ${PERFUME_CLIMATE_LABELS[pick.requested].toLowerCase()} para este evento; uno de ${PERFUME_CLIMATE_LABELS[pick.climate].toLowerCase()}`;
  else detail = `${rankLabel(pick)} · ${PERFUME_CLIMATE_LABELS[pick.climate]}`;

  return (
    <div className={`outfit-item perfume-item${locked ? ' locked' : ''}`}>
      <div className="photo thumb lg">
        <div className="placeholder">
          <PerfumeIcon />
        </div>
      </div>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <div className="pos">Perfume</div>
        {perfume && pick ? <div className="name">{perfume.name}</div> : <Link to="/ajustes/eventos" className="small">Asignar perfumes</Link>}
        <div className="tiny muted">{detail}</div>
        <div className="perfume-climate">
          <Segmented<PerfumeClimate>
            label="Clima del perfume"
            value={gen.perfumeClimate}
            onChange={(c) => !locked && chooseClimate(c)}
            options={(['hot', 'mild', 'cold'] as PerfumeClimate[]).map((c) => ({ value: c, label: PERFUME_CLIMATE_LABELS[c] }))}
          />
        </div>
      </div>
      {pick && (
        <div className="actions">
          <button
            className={`icon-btn${locked ? ' on' : ''}`}
            aria-pressed={locked}
            aria-label={locked ? 'Desbloquear perfume' : 'Bloquear perfume'}
            title={locked ? 'Bloqueado' : 'Bloquear'}
            onClick={() => gen.setPerfumeLocked(!locked)}
          >
            {locked ? <Lock /> : <LockOpen />}
          </button>
          <button className="icon-btn" aria-label="Otro perfume" title="Siguiente opción (secundario)" onClick={regenerate} disabled={locked || !hasAlternative(ctx, pick)}>
            <RefreshCw />
          </button>
        </div>
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
