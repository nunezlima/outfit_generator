// Ficha de prenda: datos, con qué combina (y excepciones) y estadísticas.

import { Archive, ArchiveRestore, Check, CheckSquare, CircleSlash, Pencil, RotateCcw, Sparkles, Trash2, WashingMachine, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { wardrobePath } from '../app/wardrobeView';
import { useWardrobeAnalysis } from '../app/analysisHook';
import { useGeneratorState } from '../app/generatorState';
import { useGarment, useGarments, useOutfits, useUsage } from '../data/hooks';
import { deleteGarments, resetGarmentStats, setGarmentRule, setGarmentRules, setStatus, washGarments } from '../data/repo';
import { formatExpected } from '../domain/analysis';
import { getColor } from '../domain/colors';
import { CompatIndex, orderedPair, type PairVerdict } from '../domain/compat';
import { formatLongDate, relativeDays } from '../domain/dates';
import { usesLeft } from '../domain/laundry';
import { CLIMATE_LABELS, STATUS_LABELS, WARMTH_LABELS, type Garment } from '../domain/types';
import { useCatalogIndex } from '../ui/CatalogContext';
import { EmptyState, Loading, Page, SearchInput, Segmented, Tabs, normalize } from '../ui/common';
import { useFeedback } from '../ui/feedback';
import { ColorSwatch, GarmentPhoto, GarmentRow, StatusBadge } from '../ui/GarmentViews';
import { Sheet } from '../ui/Sheet';

type Tab = 'info' | 'compat' | 'stats';

export function GarmentDetailScreen() {
  const { id } = useParams();
  const garment = useGarment(id);
  const [tab, setTab] = useState<Tab>('info');
  if (garment === undefined) return <Loading />;
  if (garment === null)
    return (
      <Page title="Prenda" back={wardrobePath()}>
        <EmptyState icon={<CircleSlash />} title="Esta prenda ya no existe" />
      </Page>
    );
  return (
    <Page
      title={garment.name}
      back={wardrobePath()}
      actions={
        <Link to={`/guardarropa/${garment.id}/editar`} className="icon-btn" aria-label="Editar">
          <Pencil />
        </Link>
      }
    >
      <div className="stack">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'info', label: 'Ficha' },
            { value: 'compat', label: 'Combina con' },
            { value: 'stats', label: 'Estadísticas' },
          ]}
        />
        {tab === 'info' && <InfoTab g={garment} />}
        {tab === 'compat' && <CompatTab g={garment} />}
        {tab === 'stats' && <StatsTab g={garment} />}
      </div>
    </Page>
  );
}

function InfoTab({ g }: { g: Garment }) {
  const idx = useCatalogIndex();
  const navigate = useNavigate();
  const gen = useGeneratorState();
  const { confirm, toast } = useFeedback();
  const left = usesLeft(g);
  const position = idx.positionOfType(g.type_id);

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar “${g.name}”?`,
      message: 'Se borra la prenda y su foto, y se quita de tus outfits guardados. Si solo ya no la usas, mejor archívala: así conservas su historial.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deleteGarments([g]);
    toast('Prenda eliminada');
    navigate(wardrobePath(), { replace: true });
  };

  return (
    <div className="stack-lg">
      <GarmentPhoto garment={g} variant="full" className="photo-hero" />
      <div className="row-wrap">
        <StatusBadge status={g.status} />
        {g.is_sample && <span className="badge">Ejemplo</span>}
        {idx.styleNames(g.style_ids).map((s) => (
          <span key={s} className="chip static">
            {s}
          </span>
        ))}
      </div>
      <dl className="kv">
        <dt>Tipo</dt>
        <dd>
          {idx.typeName(g.type_id)} <span className="muted">· {position?.name}</span>
        </dd>
        <dt>Color</dt>
        <dd className="row">
          {getColor(g.color) ? (
            <>
              <ColorSwatch color={g.color} /> {getColor(g.color)!.label}
            </>
          ) : (
            <span className="muted">Sin especificar</span>
          )}
        </dd>
        <dt>Abrigo</dt>
        <dd>{WARMTH_LABELS[g.warmth]}</dd>
        <dt>Clima</dt>
        <dd>{CLIMATE_LABELS[g.climate ?? 'all']}</dd>
        <dt>Lavado</dt>
        <dd>
          {left === null ? 'No va al cesto automáticamente' : `${g.uses_since_wash} de ${g.wash_after_uses} usos (${left === 0 ? 'toca lavar' : `faltan ${left}`})`}
        </dd>
        <dt>Estado</dt>
        <dd>{STATUS_LABELS[g.status]}</dd>
        {g.notes && (
          <>
            <dt>Notas</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{g.notes}</dd>
          </>
        )}
        <dt>Agregada</dt>
        <dd>{formatLongDate(new Date(g.created_at))}</dd>
      </dl>

      <div className="stack">
        {g.status === 'available' && (
          <button
            className="btn primary block"
            onClick={() => {
              gen.setPinned([g.id]);
              gen.setResult(null);
              navigate('/');
            }}
          >
            <Sparkles /> Generar un outfit con esta prenda
          </button>
        )}
        <div className="btn-row">
          {g.status === 'laundry' ? (
            <button className="btn" onClick={() => void washGarments([g]).then(() => toast('Lista para usarse'))}>
              <Check /> Lavada
            </button>
          ) : g.status === 'available' ? (
            <button className="btn" onClick={() => void setStatus([g], 'laundry').then(() => toast('Enviada al cesto'))}>
              <WashingMachine /> Al cesto
            </button>
          ) : null}
          {g.status === 'archived' ? (
            <button className="btn" onClick={() => void setStatus([g], 'available').then(() => toast('Desarchivada'))}>
              <ArchiveRestore /> Desarchivar
            </button>
          ) : (
            <button className="btn" onClick={() => void setStatus([g], 'archived').then(() => toast('Archivada: ya no saldrá en outfits'))}>
              <Archive /> Archivar
            </button>
          )}
        </div>
        <button className="btn danger block" onClick={() => void remove()}>
          <Trash2 /> Eliminar prenda
        </button>
      </div>
    </div>
  );
}

// ─── Combina con ───────────────────────────────────────────────────────────

type CompatFilter = 'all' | 'yes' | 'no' | 'exceptions';

const LEVEL_LABEL: Record<PairVerdict['level'], string> = {
  garment: 'Excepción',
  type: 'Regla de tipos',
  style: 'Estilos',
  wildcard: 'Comodín',
};

function CompatTab({ g }: { g: Garment }) {
  const idx = useCatalogIndex();
  const garments = useGarments() ?? [];
  const [filter, setFilter] = useState<CompatFilter>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ other: Garment; verdict: PairVerdict } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const compat = useMemo(() => new CompatIndex(idx.catalog), [idx.catalog]);
  const myPos = idx.positionOfType(g.type_id);

  const groups = useMemo(() => {
    const nq = normalize(q.trim());
    const rows = garments
      .filter((o) => o.id !== g.id && o.status !== 'archived')
      .filter((o) => {
        const p = idx.positionOfType(o.type_id);
        // Dos prendas de la misma posición (de una sola prenda) nunca van juntas.
        return p && (p.id !== myPos?.id || p.max_items > 1);
      })
      .filter((o) => !nq || normalize(o.name).includes(nq))
      .map((o) => ({ other: o, verdict: compat.check(g, o) }))
      .filter(({ verdict }) => filter === 'all' || (filter === 'yes' && verdict.ok) || (filter === 'no' && !verdict.ok) || (filter === 'exceptions' && verdict.level === 'garment'));
    return idx.catalog.positions
      .map((p) => ({ position: p, rows: rows.filter((r) => idx.positionOfType(r.other.type_id)?.id === p.id) }))
      .filter((grp) => grp.rows.length > 0);
  }, [garments, g, compat, filter, q, idx, myPos]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (ids: string[]) =>
    setSelected((cur) => {
      const next = new Set(cur);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const applyBulk = async (allowed: boolean | null) => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      const previous = await setGarmentRules([...selected].map((id) => ({ a: g.id, b: id, allowed })));
      const n = previous.length;
      const what = allowed === null ? 'quedan según las reglas' : allowed ? 'ahora siempre combinan' : 'ahora nunca combinan';
      toast(`${n} ${n === 1 ? 'prenda' : 'prendas'}: ${what}`, { label: 'Deshacer', run: () => void setGarmentRules(previous) }, 7000);
      exitSelection();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="hint">
        Gana la regla más específica: <b>excepción de prenda</b> → <b>regla de tipos</b> → <b>matriz de estilos</b>.{' '}
        {selecting ? 'Toca las prendas que quieras cambiar y elige abajo.' : 'Toca una prenda para crear o quitar una excepción, o selecciona varias.'}
      </p>
      <div className="row">
        <div className="grow">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar prenda…" />
        </div>
        {selecting ? (
          <button className="btn sm" onClick={exitSelection}>
            Listo
          </button>
        ) : (
          <button className="btn sm" onClick={() => setSelecting(true)}>
            <CheckSquare /> Seleccionar
          </button>
        )}
      </div>
      <Segmented<CompatFilter>
        label="Filtrar"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Todas' },
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
          { value: 'exceptions', label: 'Excepciones' },
        ]}
      />
      {groups.length === 0 && <EmptyState icon={<Check />} title="Nada que mostrar" />}
      {groups.map(({ position, rows }) => (
        <div key={position.id} className="stack" style={{ gap: 6 }}>
          <div className="section-title">
            <h3>{position.name}</h3>
            {selecting ? (
              <button className="btn sm ghost" onClick={() => toggleAll(rows.map((r) => r.other.id))}>
                {rows.every((r) => selected.has(r.other.id)) ? 'Quitar todas' : `Todas (${rows.length})`}
              </button>
            ) : (
              <span className="small muted">
                combina con {rows.filter((r) => r.verdict.ok).length} de {rows.length}
              </span>
            )}
          </div>
          <div className="card-list">
            {rows.map(({ other, verdict }) => (
              <GarmentRow
                key={other.id}
                garment={other}
                size="sm"
                onClick={() => (selecting ? toggle(other.id) : setEditing({ other, verdict }))}
                sub={
                  <>
                    <span className="level-tag" style={{ color: verdict.ok ? 'var(--success)' : 'var(--danger)' }}>
                      {LEVEL_LABEL[verdict.level]}
                    </span>{' '}
                    · {verdict.reason}
                  </>
                }
                right={
                  <span className="row" style={{ gap: 8 }}>
                    {verdict.ok ? <span className="badge good"><Check /> Sí</span> : <span className="badge danger"><X /> No</span>}
                    {selecting && <span className={`check${selected.has(other.id) ? ' on' : ''}`}>{selected.has(other.id) && <Check strokeWidth={3} />}</span>}
                  </span>
                }
              />
            ))}
          </div>
        </div>
      ))}
      {editing && <ExceptionSheet g={g} other={editing.other} verdict={editing.verdict} onClose={() => setEditing(null)} />}
      {selecting && <div aria-hidden style={{ height: 64 }} />}
      {selecting && (
        <div className="select-bar">
          <span className="small">{selected.size === 0 ? 'Elige prendas' : `${selected.size} ${selected.size === 1 ? 'prenda' : 'prendas'}`}</span>
          <button className="btn sm" disabled={busy || selected.size === 0} onClick={() => void applyBulk(true)} title="Siempre combinan">
            <Check /> Sí
          </button>
          <button className="btn sm" disabled={busy || selected.size === 0} onClick={() => void applyBulk(false)} title="Nunca combinan">
            <X /> No
          </button>
          <button className="btn sm ghost" disabled={busy || selected.size === 0} onClick={() => void applyBulk(null)} title="Quitar la excepción">
            Reglas
          </button>
        </div>
      )}
    </div>
  );
}

function ExceptionSheet({ g, other, verdict, onClose }: { g: Garment; other: Garment; verdict: PairVerdict; onClose: () => void }) {
  const idx = useCatalogIndex();
  const { toast } = useFeedback();
  const [a, b] = orderedPair(g.id, other.id);
  const rule = idx.catalog.garmentRules.find((r) => r.garment_a === a && r.garment_b === b);
  const current: 'yes' | 'no' | 'auto' = rule ? (rule.allowed ? 'yes' : 'no') : 'auto';
  // Qué diría el sistema sin la excepción (para explicarlo).
  const withoutException = useMemo(() => {
    const cat = { ...idx.catalog, garmentRules: idx.catalog.garmentRules.filter((r) => r !== rule) };
    return new CompatIndex(cat).check(g, other);
  }, [idx.catalog, rule, g, other]);

  const set = async (v: 'yes' | 'no' | 'auto') => {
    await setGarmentRule(g.id, other.id, v === 'auto' ? null : v === 'yes');
    toast(v === 'auto' ? 'Excepción quitada' : v === 'yes' ? 'Ahora siempre combinan' : 'Ahora nunca combinan');
    onClose();
  };

  const option = (value: 'yes' | 'no' | 'auto', title: string, text: string) => (
    <button key={value} className="list-item" onClick={() => void set(value)}>
      <span className={`check${current === value ? ' on' : ''}`}>{current === value && <Check strokeWidth={3} />}</span>
      <span className="grow">
        <b>{title}</b>
        <span className="small muted" style={{ display: 'block' }}>
          {text}
        </span>
      </span>
    </button>
  );

  return (
    <Sheet title="¿Combinan?" onClose={onClose}>
      <div className="stack">
        <div className="row">
          <GarmentPhoto garment={g} className="thumb" />
          <span className="muted">+</span>
          <GarmentPhoto garment={other} className="thumb" />
          <div className="grow small">
            <b>{g.name}</b> y <b>{other.name}</b>
          </div>
        </div>
        <div className={`callout ${verdict.ok ? 'good' : 'danger'}`}>
          {verdict.ok ? <Check /> : <X />}
          <span>
            Ahora: <b>{verdict.ok ? 'sí combinan' : 'no combinan'}</b>. {verdict.reason}
          </span>
        </div>
        <div className="card-list">
          {option('auto', 'Según las reglas', `Sin excepción: ${withoutException.ok ? 'sí' : 'no'} combinan (${withoutException.reason})`)}
          {option('yes', 'Siempre combinan', 'Excepción: se permiten juntas aunque las reglas digan que no.')}
          {option('no', 'Nunca combinan', 'Excepción: nunca saldrán juntas en un outfit.')}
        </div>
      </div>
    </Sheet>
  );
}

// ─── Estadísticas ──────────────────────────────────────────────────────────

function StatsTab({ g }: { g: Garment }) {
  const usage = useUsage()?.get(g.id);
  const { analysis } = useWardrobeAnalysis();
  const outfits = (useOutfits() ?? []).filter((o) => o.garment_ids.includes(g.id));
  const { confirm, toast } = useFeedback();
  if (!usage || !analysis) return <Loading />;
  const row = analysis.byId.get(g.id);

  const reset = async () => {
    const ok = await confirm({
      title: 'Reiniciar contadores',
      message: 'Sus usos vuelven a cero para el análisis (como si la acabaras de agregar). El calendario conserva el historial.',
      confirmText: 'Reiniciar',
    });
    if (!ok) return;
    await resetGarmentStats([g]);
    toast('Contadores reiniciados');
  };

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <div className="stat">
          <b>{usage.recentWears}</b>
          <span>usos en {analysis.periodDays} días</span>
        </div>
        <div className="stat">
          <b>{row && row.expected > 0 ? `~${formatExpected(row.expected)}` : '—'}</b>
          <span>esperado en su grupo</span>
        </div>
        <div className="stat">
          <b>{usage.timesWorn}</b>
          <span>usos en total</span>
        </div>
        <div className="stat">
          <b className="ellipsis" style={{ fontSize: '1rem', lineHeight: 1.9 }}>
            {usage.lastWornOn ? relativeDays(usage.daysSinceUse) : 'Nunca'}
          </b>
          <span>último uso</span>
        </div>
      </div>
      <p className="hint">
        {row?.position ? `Se compara con tus prendas de ${row.position.name.toLowerCase()}: ` : ''}
        el esperado es lo que le tocaría si rotaras parejo. Solo cuentan los días que marcas “Lo usé hoy”.
      </p>
      {g.stats_reset_at && <p className="hint">Contadores reiniciados el {formatLongDate(new Date(g.stats_reset_at))}.</p>}
      <button className="btn block" onClick={() => void reset()}>
        <RotateCcw /> Reiniciar contadores
      </button>
      <div className="stack" style={{ gap: 6 }}>
        <h3>En outfits guardados ({outfits.length})</h3>
        {outfits.length === 0 ? (
          <p className="hint">Todavía no está en ningún outfit guardado.</p>
        ) : (
          <div className="card-list">
            {outfits.map((o) => (
              <Link key={o.id} to={`/outfits/${o.id}`} className="list-item">
                <span className="grow">{o.name}</span>
                {o.favorite && <span className="badge accent">Favorito</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
